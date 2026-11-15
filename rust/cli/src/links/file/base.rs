use crate::{
    adapters::IAdapters,
    sync::local::files::{base_path, read_bytes, write_bytes},
};
use envden_core::{adapters::TPlacementMode, errors::Result};
use std::path::Path;

pub fn mode_name(mode: TPlacementMode) -> &'static str {
    if mode == TPlacementMode::Copy {
        "copy"
    } else {
        "link"
    }
}

pub(super) fn copy_base(
    adapters: &IAdapters,
    store: &str,
    root: &str,
    mode: TPlacementMode,
) -> Result<()> {
    if mode == TPlacementMode::Copy {
        write_bytes(
            &base_path(&adapters.home, store, Some(root)),
            read_bytes(Path::new(store))?.as_deref(),
            (adapters.now)(),
        )?;
    }
    Ok(())
}
