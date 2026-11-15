use super::{
    base::{copy_base, mode_name},
    choice::choose_version,
    existing::relink_existing,
};
use crate::{
    adapters::IAdapters,
    links::checkout::placement::place_file,
    output::{home_path, sanitize_terminal},
    state::files::{atomic_write, failure},
    store::store_path,
    sync::local::validation::size::file_size_notice,
};
use envden_core::{
    adapters::{ICheckout, IPlacementAdapter, TPlacementState},
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::{Value, json};
use std::{fs, path::Path};

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
        crate::links::approval::repo_of(state, &checkout.repo_id),
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
        if !exists(&store)? {
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

fn exists(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(failure(error)),
    }
}
