use super::checkout::placement::place_file;
use crate::{
    adapters::IAdapters,
    state::{lock::with_state_lock, repository::save_state},
};
use envden_core::{
    adapters::{TPlacementMode, TPlacementState},
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::Value;
use std::path::Path;

pub fn mark_local_only(
    adapters: &IAdapters,
    state: &mut Value,
    root: &str,
    path: &str,
) -> Result<()> {
    with_state_lock(&adapters.home, &adapters.now, || {
        let link = state["links"]
            .as_array_mut()
            .and_then(|a| {
                a.iter_mut()
                    .find(|a| a["root"] == root && a["path"] == path)
            })
            .ok_or_else(|| {
                EnvdenError::new(ErrorCode::NotFound, "File is not managed by envden")
            })?;
        let store = link["store"].as_str().unwrap_or_default();
        let placement = adapters.placement(TPlacementMode::Copy, Path::new(root));
        let destination = Path::new(root).join(path).to_string_lossy().into_owned();
        match placement.inspect(store, &destination)? {
            TPlacementState::Linked | TPlacementState::Relinkable => place_file(
                adapters,
                placement.as_ref(),
                root,
                store,
                &destination,
                None,
            )?,
            TPlacementState::Missing => {
                return Err(EnvdenError::new(ErrorCode::NotFound, "File is missing"));
            }
            _ => {}
        }
        link["mode"] = "copy".into();
        link["localOnly"] = true.into();
        save_state(&adapters.home, state, (adapters.now)())
    })
}
