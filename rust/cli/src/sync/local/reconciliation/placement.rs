use crate::{
    adapters::IAdapters,
    links::approval::checkout_approval,
    sync::local::{
        conflicts::{IConflictTarget, backup},
        files::read_bytes,
    },
};
use envden_core::{
    adapters::{TPlacementMode, TPlacementState},
    errors::Result,
};
use serde_json::Value;
use std::path::Path;

pub struct IPlacementContext<'a> {
    pub adapters: &'a IAdapters,
    pub state: &'a mut Value,
    pub cwd: Option<&'a Path>,
    pub now: u64,
    pub report: &'a dyn Fn(&str),
}

pub fn place_file_target(
    context: &mut IPlacementContext<'_>,
    target: &IConflictTarget,
    bytes: Option<&[u8]>,
    preserve_deleted: bool,
    synced: Option<&[u8]>,
) -> Result<bool> {
    if !Path::new(&target.root).is_dir() {
        return Ok(false);
    }
    let destination = Path::new(&target.root).join(&target.path);
    let checkout = context
        .adapters
        .repo
        .checkout_at(&target.root)?
        .filter(|c| checkout_approval(context.state, c) == "approved");
    let current = context.state["links"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|l| l["root"] == target.root && l["path"] == target.path);
    let skip = if checkout.is_none() {
        Some("checkout needs approval; run envden track")
    } else if current.is_some_and(|l| l["localOnly"] == true) {
        Some("marked local only")
    } else if current.is_some_and(|l| l["mode"] != target.mode || l["store"] != target.store) {
        Some("placement changed; run envden pull")
    } else {
        None
    };
    if let Some(reason) = skip {
        (context.report)(&crate::output::sanitize_terminal(&format!(
            "Skipped {}: {reason}",
            destination.display()
        )));
        return Ok(false);
    }
    let mode = if target.mode == "copy" {
        TPlacementMode::Copy
    } else {
        TPlacementMode::Link
    };
    let placement = context.adapters.placement(mode, Path::new(&target.root));
    let dest = destination.to_string_lossy();
    let status = placement.inspect(&target.store, &dest)?;
    let previous = if status == TPlacementState::Linked {
        None
    } else {
        read_bytes(&destination)?
    };
    let identical = status == TPlacementState::Linked || previous.as_deref() == bytes;
    if !identical
        && previous.is_some()
        && previous.as_deref() != synced
        && let Some(saved) = backup(&context.adapters.home, &destination, context.now)?
    {
        let shown = context
            .cwd
            .and_then(|cwd| destination.strip_prefix(cwd).ok())
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or(&destination);
        (context.report)(&crate::output::sanitize_terminal(&format!(
            "Kept your previous {} at {}",
            shown.display(),
            saved.display()
        )));
    }
    if bytes.is_some() {
        context
            .adapters
            .repo
            .ensure_ignored(checkout.as_ref().unwrap(), &target.path)?;
        if if mode == TPlacementMode::Copy {
            !identical
        } else {
            status != TPlacementState::Linked
        } {
            crate::links::checkout::placement::place_file(
                context.adapters,
                placement.as_ref(),
                &target.root,
                &target.store,
                &dest,
                None,
            )?;
        }
        if current.is_none() {
            context.state["links"]
                .as_array_mut()
                .unwrap()
                .push(serde_json::to_value(target).unwrap());
        }
    } else {
        placement.remove(Some(&target.store), &dest)?;
        if !preserve_deleted {
            context.state["links"]
                .as_array_mut()
                .unwrap()
                .retain(|l| l["root"] != target.root || l["path"] != target.path);
        }
    }
    Ok(true)
}
