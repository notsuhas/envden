use crate::sync::{
    local::{
        conflicts::IConflictTarget,
        files::{base_path, read_bytes},
    },
    remote::context::ISyncContext,
};
use envden_core::{
    adapters::{TPlacementMode, TPlacementState},
    errors::Result,
};
use std::path::Path;

pub struct ISnapshot {
    pub bytes: Option<Vec<u8>>,
    pub base: Option<Vec<u8>>,
    pub tracked: bool,
    pub use_store: bool,
    pub detached: bool,
    pub link: bool,
    pub historical: bool,
}

pub fn snapshot(
    context: &ISyncContext<'_>,
    target: &IConflictTarget,
    stored: Option<&[u8]>,
    previous: Option<&[u8]>,
) -> Result<ISnapshot> {
    let link = target.mode == "link";
    let mode = if link {
        TPlacementMode::Link
    } else {
        TPlacementMode::Copy
    };
    let destination = Path::new(&target.root).join(&target.path);
    let status = context
        .adapters
        .placement(mode, Path::new(&target.root))
        .inspect(&target.store, &destination.to_string_lossy())?;
    let tracked = context.state["links"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|l| l["root"] == target.root && l["path"] == target.path);
    let use_store = link && status != TPlacementState::Detached;
    let bytes = if use_store {
        stored.map(<[u8]>::to_vec)
    } else {
        read_bytes(&destination)?
    };
    let base = read_bytes(&base_path(
        &context.adapters.home,
        &target.store,
        if link { None } else { Some(&target.root) },
    ))?;
    let detached = link
        && status == TPlacementState::Detached
        && bytes.as_deref() != stored
        && (!tracked || stored != base.as_deref());
    let historical =
        (!tracked || base.is_none()) && bytes.is_some() && bytes.as_deref() == previous;
    Ok(ISnapshot {
        bytes,
        base,
        tracked,
        use_store,
        detached,
        link,
        historical,
    })
}
