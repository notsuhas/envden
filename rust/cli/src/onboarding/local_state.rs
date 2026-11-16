use crate::state::repository::load_state;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;
use std::path::Path;

pub(super) fn join_local_state(home: &Path, vault: &str) -> Result<Option<Value>> {
    let Some(state) = load_state(home)? else {
        return Ok(None);
    };
    let Some(existing) = state["vaultId"].as_str().filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    if existing == vault {
        return Ok(Some(state));
    }
    if state["creationPending"].as_str().is_none_or(str::is_empty) {
        return Err(EnvdenError::new(
            ErrorCode::Conflict,
            "Device is already configured for another vault",
        ));
    }
    Ok(None)
}
