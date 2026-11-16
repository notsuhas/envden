use super::placement::place_file;
use crate::{
    adapters::IAdapters,
    state::{
        lock::with_state_lock,
        repository::{load_state, save_state},
    },
    sync::local::{
        conflicts::remove_conflict_targets,
        files::read_bytes,
        reconciliation::operation::deletion::{read_deletion, request_deletion},
    },
};
use envden_core::{
    adapters::{TPlacementMode, TPlacementState},
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::Value;
use std::path::Path;

pub fn untrack(adapters: &IAdapters, path: &str) -> Result<Vec<String>> {
    with_state_lock(&adapters.home, &adapters.now, || {
        let state = load_state(&adapters.home)?;
        let root = adapters.repo.checkout_at(path)?.map(|c| c.root);
        let mut state = state
            .filter(|s| {
                root.as_ref().is_some_and(|r| {
                    s["approved"]
                        .as_array()
                        .is_some_and(|a| a.iter().any(|a| a["root"].as_str() == Some(r)))
                })
            })
            .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Checkout is not tracked"))?;
        let root = root.unwrap_or_default();
        let links = state["links"].as_array().cloned().unwrap_or_default();
        let removed: Vec<_> = links
            .iter()
            .filter(|l| l["root"] == root)
            .cloned()
            .collect();
        let remaining: Vec<_> = links
            .iter()
            .filter(|l| l["root"] != root)
            .cloned()
            .collect();
        let mut cancelled = Vec::new();
        for link in &removed {
            let store = link["store"].as_str().unwrap_or_default();
            if let Some(intent) = read_deletion(&adapters.home, store, (adapters.now)())? {
                let keep = remaining.iter().any(|l| l["store"] == store);
                let destination = Path::new(&root)
                    .join(link["path"].as_str().unwrap_or_default())
                    .to_string_lossy()
                    .into_owned();
                request_deletion(
                    &adapters.home,
                    store,
                    keep,
                    Some(&intent.entry),
                    Some(
                        intent
                            .targets
                            .iter()
                            .filter(|p| **p != destination)
                            .cloned()
                            .collect(),
                    ),
                    (adapters.now)(),
                )?;
                if !keep {
                    cancelled.extend(intent.targets);
                }
            }
            detach_file(adapters, link)?;
        }
        super::bases::remove_checkout_bases(
            &adapters.home,
            &removed,
            &remaining,
            (adapters.now)(),
        )?;
        remove_conflict_targets(&adapters.home, &root, (adapters.now)())?;
        state["links"] = remaining.into();
        if let Some(approved) = state["approved"].as_array_mut() {
            approved.retain(|a| a["root"] != root);
        }
        save_state(&adapters.home, &state, (adapters.now)())?;
        crate::notice::cache::refresh_notice(
            &adapters.home,
            &state,
            |r| adapters.repo.case_insensitive(r, true),
            (adapters.now)(),
        )?;
        Ok(cancelled)
    })
}

fn detach_file(adapters: &IAdapters, link: &Value) -> Result<()> {
    let root = link["root"].as_str().unwrap_or_default();
    let store = link["store"].as_str().unwrap_or_default();
    let destination = Path::new(root).join(link["path"].as_str().unwrap_or_default());
    let text = destination.to_string_lossy();
    let placement = adapters.placement(TPlacementMode::Copy, Path::new(root));
    if !matches!(
        placement.inspect(store, &text)?,
        TPlacementState::Linked | TPlacementState::Relinkable
    ) {
        return Ok(());
    }
    if let Some(original) = link["originalLink"].as_str().filter(|s| !s.is_empty()) {
        let target = destination
            .parent()
            .unwrap_or(Path::new("/"))
            .join(original);
        if super::super::takeover::target::regular_target(&target) {
            placement.remove(Some(store), &text)?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(original, &destination)
                .map_err(crate::state::files::failure)?;
            #[cfg(windows)]
            std::os::windows::fs::symlink_file(original, &destination)
                .map_err(crate::state::files::failure)?;
            return Ok(());
        }
    }
    if read_bytes(Path::new(store))?.is_none() {
        placement.remove(Some(store), &text)?;
    } else {
        place_file(adapters, placement.as_ref(), root, store, &text, None)?;
    }
    Ok(())
}
