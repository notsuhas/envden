use crate::{
    output::sanitize_terminal,
    state::files::{atomic_write, optional_read},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::{Map, Value};
use std::path::Path;

pub fn pending_joins(home: &Path) -> Result<Map<String, Value>> {
    let value = optional_read(&home.join("state/pending-recovery.json"))?
        .and_then(|s| serde_json::from_str::<Value>(&s).ok());
    Ok(value
        .and_then(|v| {
            v.as_object()
                .filter(|o| o.values().all(Value::is_string))
                .cloned()
        })
        .unwrap_or_default())
}

pub fn print_recovery_joins(home: &Path, notices: &Map<String, Value>, now: u64) -> Result<()> {
    let path = home.join("state/recovery-notice");
    let mut seen: Vec<String> = serde_json::from_str(
        &optional_read(&path)?.unwrap_or_else(|| "[]".into()),
    )
    .map_err(|e| EnvdenError::with_source(ErrorCode::InvalidData, "Invalid recovery notice", e))?;
    for (id, name) in notices {
        if seen.contains(id) {
            continue;
        }
        eprintln!(
            "envden: {} joined with the recovery kit",
            sanitize_terminal(name.as_str().unwrap_or(""))
        );
        seen.push(id.clone());
    }
    atomic_write(
        &path,
        serde_json::to_string(&seen)
            .expect("notice JSON")
            .as_bytes(),
        now,
    )
}

pub fn report_pending_joins(home: &Path, now: u64) -> Result<()> {
    print_recovery_joins(home, &pending_joins(home)?, now)?;
    atomic_write(&home.join("state/pending-recovery.json"), b"{}", now)
}
