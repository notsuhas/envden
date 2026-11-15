use super::super::checkout::placement::place_file;
use super::super::{
    approval::repo_of,
    checkout::mode::supported_placement,
    file::{IOwnLink, mode_name},
};
use super::{group::IOwnLinkGroup, target::read_target};
use crate::{
    adapters::IAdapters,
    output::{home_path, sanitize_terminal},
    state::files::atomic_write,
    store::store_path,
    sync::local::{
        files::{base_path, read_bytes, write_bytes},
        validation::size::file_size_notice,
    },
};
use envden_core::{
    adapters::TPlacementMode,
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::{Value, json};
use std::path::Path;

pub fn adopt_group(
    adapters: &IAdapters,
    state: &mut Value,
    group: IOwnLinkGroup,
    copy: bool,
) -> Result<Vec<IOwnLink>> {
    let home = adapters
        .user_home
        .canonicalize()
        .unwrap_or_else(|_| adapters.user_home.clone());
    let target = sanitize_terminal(&home_path(Path::new(&group.target), &home));
    let Some(content) = read_target(Path::new(&group.target)) else {
        eprintln!("envden: can't read {target}; left the links to it in place");
        return Ok(group.links);
    };
    if let Some(notice) = file_size_notice(&group.target, Some(&content)) {
        eprintln!("{notice}");
        return Ok(group.links);
    }
    let mut left = Vec::new();
    for link in group.links {
        let shown = sanitize_terminal(&home_path(
            &Path::new(&link.checkout.root).join(&link.path),
            &home,
        ));
        match adopt_link(adapters, state, &link, &content, copy) {
            Ok(true) => continue,
            Ok(false) => {
                eprintln!("envden: left {shown} linked to {target}: its synced copy differs")
            }
            Err(_) => eprintln!("envden: couldn't take over {shown}; left it linked to {target}"),
        }
        left.push(link);
    }
    Ok(left)
}

fn adopt_link(
    adapters: &IAdapters,
    state: &mut Value,
    own: &IOwnLink,
    content: &[u8],
    copy: bool,
) -> Result<bool> {
    let checkout = &own.checkout;
    let store = store_path(&adapters.home, repo_of(state, &checkout.repo_id), &own.path)?;
    if let Some(stored) = read_bytes(&store)? {
        if stored != content {
            return Ok(false);
        }
    } else {
        atomic_write(&store, content, (adapters.now)())?;
    }
    adapters.repo.ensure_ignored(checkout, &own.path)?;
    let placement = supported_placement(adapters, &checkout.root, copy)?;
    let store_text = store.to_string_lossy().into_owned();
    place_file(
        adapters,
        placement.as_ref(),
        &checkout.root,
        &store_text,
        &Path::new(&checkout.root).join(&own.path).to_string_lossy(),
        Some(&own.link),
    )?;
    if placement.mode() == TPlacementMode::Copy {
        write_bytes(
            &base_path(&adapters.home, &store_text, Some(&checkout.root)),
            Some(content),
            (adapters.now)(),
        )?;
    }
    state["links"].as_array_mut().ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Unreadable local state"))?.push(json!({"root":checkout.root,"path":own.path,"store":store_text,"mode":mode_name(placement.mode()),"originalLink":own.link}));
    Ok(true)
}
