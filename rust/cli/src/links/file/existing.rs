use super::base::{copy_base, mode_name};
use crate::{adapters::IAdapters, links::checkout::placement::place_file};
use envden_core::{
    adapters::{ICheckout, IPlacementAdapter, TPlacementMode, TPlacementState},
    errors::Result,
};
use serde_json::Value;
use std::path::Path;

pub(super) fn relink_existing(
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
