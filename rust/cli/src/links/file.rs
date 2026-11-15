use super::checkout::placement::place_file;
use crate::{
    adapters::IAdapters,
    output::{home_path, sanitize_terminal},
    state::files::{atomic_write, failure},
    store::store_path,
    sync::local::{
        files::{base_path, read_bytes, write_bytes},
        validation::size::file_size_notice,
    },
};
use envden_core::{
    adapters::{ICheckout, IPlacementAdapter, TPlacementMode, TPlacementState},
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, IsTerminal},
    path::Path,
};

#[derive(Clone, Debug)]
pub struct IOwnLink {
    pub checkout: ICheckout,
    pub path: String,
    pub link: String,
    pub target: String,
}

pub fn link_file(
    adapters: &IAdapters,
    state: &mut Value,
    checkout: &ICheckout,
    placement: &dyn IPlacementAdapter,
    path: &str,
) -> Result<Option<IOwnLink>> {
    let destination = Path::new(&checkout.root).join(path);
    let store = store_path(
        &adapters.home,
        super::approval::repo_of(state, &checkout.repo_id),
        path,
    )?;
    let links = state["links"]
        .as_array_mut()
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Unreadable local state"))?;
    if let Some(existing) = links
        .iter_mut()
        .find(|l| l["root"] == checkout.root && l["path"] == path)
    {
        relink_existing(adapters, checkout, placement, &destination, existing)?;
        return Ok(None);
    }
    let store_text = store.to_string_lossy().into_owned();
    let destination_text = destination.to_string_lossy().into_owned();
    if fs::symlink_metadata(&destination)
        .map_err(failure)?
        .is_symlink()
    {
        if placement.inspect(&store_text, &destination_text)? != TPlacementState::Linked {
            let link = fs::read_link(&destination).map_err(failure)?;
            let target =
                std::path::absolute(destination.parent().unwrap_or(Path::new("/")).join(&link))
                    .map_err(failure)?;
            return Ok(Some(IOwnLink {
                checkout: checkout.clone(),
                path: path.into(),
                link: link.to_string_lossy().into_owned(),
                target: target
                    .canonicalize()
                    .unwrap_or(target)
                    .to_string_lossy()
                    .into_owned(),
            }));
        }
        if !store.try_exists().map_err(failure)? {
            placement.remove(Some(&store_text), &destination_text)?;
            eprintln!(
                "envden: removed {}, a link to a deleted copy",
                sanitize_terminal(&home_path(&destination, &adapters.user_home))
            );
            return Ok(None);
        }
        links.push(json!({"root":checkout.root,"path":path,"store":store_text,"mode":mode_name(placement.mode())}));
        return Ok(None);
    }
    let content = fs::read(&destination).map_err(failure)?;
    if let Some(notice) = file_size_notice(&destination_text, Some(&content)) {
        eprintln!("{notice}");
        return Ok(None);
    }
    let stored = match fs::symlink_metadata(&store) {
        Ok(meta) if !meta.is_file() || meta.is_symlink() => {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Unsafe store file",
            ));
        }
        Ok(_) => Some(fs::read(&store).map_err(failure)?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(failure(e)),
    };
    let choice = if let Some(stored) = stored {
        if stored == content {
            "store".to_owned()
        } else {
            choose_version(&destination_text)?
        }
    } else {
        atomic_write(&store, &content, (adapters.now)())?;
        "store".to_owned()
    };
    if choice == "skip" {
        eprintln!(
            "envden: {} differs from the synced copy; skipped",
            sanitize_terminal(&destination_text)
        );
        return Ok(None);
    }
    adapters.repo.ensure_ignored(checkout, path)?;
    if choice == "separate" {
        links.push(json!({"root":checkout.root,"path":path,"store":store_text,"mode":"copy","localOnly":true}));
        return Ok(None);
    }
    place_file(
        adapters,
        placement,
        &checkout.root,
        &store_text,
        &destination_text,
        None,
    )?;
    copy_base(adapters, &store_text, &checkout.root, placement.mode())?;
    links.push(json!({"root":checkout.root,"path":path,"store":store_text,"mode":mode_name(placement.mode())}));
    Ok(None)
}

fn choose_version(path: &str) -> Result<String> {
    if !io::stdin().is_terminal() {
        return Ok("skip".into());
    }
    crate::output::prompts::choose(
        &format!("{path} differs from the synced copy"),
        &[
            ("separate".into(), "Keep separate (local only)".into()),
            ("store".into(), "Use the synced version".into()),
        ],
        None,
    )
}

pub fn mode_name(mode: TPlacementMode) -> &'static str {
    if mode == TPlacementMode::Copy {
        "copy"
    } else {
        "link"
    }
}

fn copy_base(adapters: &IAdapters, store: &str, root: &str, mode: TPlacementMode) -> Result<()> {
    if mode == TPlacementMode::Copy {
        write_bytes(
            &base_path(&adapters.home, store, Some(root)),
            read_bytes(Path::new(store))?.as_deref(),
            (adapters.now)(),
        )?;
    }
    Ok(())
}

fn relink_existing(
    adapters: &IAdapters,
    checkout: &ICheckout,
    placement: &dyn IPlacementAdapter,
    destination: &Path,
    existing: &mut Value,
) -> Result<()> {
    if existing["localOnly"] == true {
        return Ok(());
    }
    let mode = if existing["mode"] == "copy" {
        TPlacementMode::Copy
    } else {
        TPlacementMode::Link
    };
    let current = adapters.placement(mode, Path::new(&checkout.root));
    let store = existing["store"].as_str().unwrap_or_default();
    let destination = destination.to_string_lossy();
    let status = current.inspect(store, &destination)?;
    if !matches!(
        status,
        TPlacementState::Relinkable | TPlacementState::Linked
    ) {
        return Ok(());
    }
    if mode != placement.mode() {
        place_file(
            adapters,
            placement,
            &checkout.root,
            store,
            &destination,
            None,
        )?;
        copy_base(adapters, store, &checkout.root, placement.mode())?;
        existing["mode"] = mode_name(placement.mode()).into();
    } else if status == TPlacementState::Relinkable {
        place_file(
            adapters,
            current.as_ref(),
            &checkout.root,
            store,
            &destination,
            None,
        )?;
    }
    Ok(())
}
