use crate::{
    links::checkout::placement::place_file,
    sync::{
        local::{
            applied::mark_applied_entry,
            conflicts::IConflictTarget,
            files::{base_path, write_bytes},
        },
        remote::context::ISyncContext,
    },
};
use envden_core::{
    adapters::{TPlacementMode, TPlacementState},
    errors::Result,
};
use std::path::Path;

pub(super) fn finish_file(
    context: &mut ISyncContext<'_>,
    targets: &[IConflictTarget],
    store: &str,
    next: Option<&[u8]>,
    server: Option<&[u8]>,
    entry: Option<&str>,
) -> Result<()> {
    let now = (context.options.now)();
    let synced = super::preserve::synced_content(context, store);
    if crate::sync::local::files::read_bytes(Path::new(store))?.as_deref() != next {
        super::preserve::keep_unsynced(
            context,
            Path::new(store),
            targets.first(),
            synced.as_deref(),
        )?;
    }
    write_bytes(Path::new(store), next, now)?;
    write_bytes(&base_path(&context.adapters.home, store, None), next, now)?;
    if let Some(entry) = entry {
        mark_applied_entry(&context.adapters.home, entry, Some(store), now)?;
    }
    let preserve = server.is_some()
        || super::deletion::read_deletion(&context.adapters.home, store, now)?.is_some();
    for target in targets {
        if !Path::new(&target.root).is_dir() {
            continue;
        }
        let mode = if target.mode == "copy" {
            TPlacementMode::Copy
        } else {
            TPlacementMode::Link
        };
        let placement = context.adapters.placement(mode, Path::new(&target.root));
        let destination = Path::new(&target.root)
            .join(&target.path)
            .to_string_lossy()
            .into_owned();
        let status = placement.inspect(store, &destination)?;
        let identical = status == TPlacementState::Linked
            || crate::sync::local::files::read_bytes(Path::new(&destination))?.as_deref() == next;
        if !identical {
            super::preserve::keep_unsynced(
                context,
                Path::new(&destination),
                Some(target),
                synced.as_deref(),
            )?;
        }
        if next.is_some() {
            let status = placement.inspect(store, &destination)?;
            if status != TPlacementState::Linked || mode == TPlacementMode::Copy {
                place_file(
                    context.adapters,
                    placement.as_ref(),
                    &target.root,
                    store,
                    &destination,
                    None,
                )?;
            }
            if !context.state["links"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|l| l["root"] == target.root && l["path"] == target.path)
            {
                context.state["links"]
                    .as_array_mut()
                    .unwrap()
                    .push(serde_json::to_value(target).unwrap());
            }
        } else {
            placement.remove(Some(store), &destination)?;
            if !preserve {
                context.state["links"]
                    .as_array_mut()
                    .unwrap()
                    .retain(|l| l["root"] != target.root || l["path"] != target.path);
            }
        }
        if mode == TPlacementMode::Copy {
            write_bytes(
                &base_path(&context.adapters.home, store, Some(&target.root)),
                next,
                now,
            )?;
        }
    }
    crate::state::repository::save_state(&context.adapters.home, &context.state, now)
}
