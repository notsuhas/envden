use super::cache::read_update_cache;
use crate::{
    state::files::{atomic_write, failure, optional_read},
    version::VERSION,
};
use envden_core::errors::{EnvdenError, Result};
use serde_json::{Value, json};
use std::path::Path;

pub fn update_status(home: &Path) -> Result<Value> {
    let cache = read_update_cache(home);
    let available = cache.latest.as_deref().is_some_and(|s| {
        envden_protocol::protocol::compare_semver(s, VERSION).is_ok_and(|o| o.is_gt())
    });
    let mut result = json!({"available":available,"required":optional_read(&home.join("state/update-required"))?.as_deref() == Some(VERSION)});
    if let Some(message) = cache.message.filter(|s| !s.is_empty()) {
        result["message"] = json!(message);
    }
    Ok(result)
}

pub fn record_update_required(home: &Path, error: &EnvdenError, now: u64) -> Result<()> {
    if error.message == "The server requires a version that doesn't exist" {
        return Ok(());
    }
    atomic_write(&home.join("state/update-required"), VERSION.as_bytes(), now)
}

pub fn authenticated_request_succeeded(home: &Path) -> Result<()> {
    match std::fs::remove_file(home.join("state/update-required")) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(failure(e)),
    }
}
