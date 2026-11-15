use super::{
    TLocalState,
    files::{atomic_write, optional_read},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::{Value, json};
use std::path::Path;

pub fn journal_placement(home: &Path, state: &TLocalState, now: u64) -> Result<()> {
    let mut value = json!({});
    if let Some(checkpoint) = state.get("checkpoint") {
        value["checkpoint"] = checkpoint.clone();
    }
    value["links"] = state["links"].clone();
    let bytes = value.to_string();
    let path = home.join("state/placement.json");
    if optional_read(&path)?.as_deref() == Some(&bytes) {
        return Ok(());
    }
    atomic_write(&path, bytes.as_bytes(), now)
}

pub fn restore_placement(home: &Path, state: &mut TLocalState) -> Result<()> {
    let path = home.join("state/placement.json");
    let journal = super::records::read_sync_record(&path, |text| {
        serde_json::from_str::<Value>(text).map_err(|e| {
            EnvdenError::with_source(ErrorCode::InvalidData, "Invalid placement journal", e)
        })
    })?;
    let Some(journal) = journal else {
        return Ok(());
    };
    if journal.get("checkpoint") != state.get("checkpoint") {
        return Ok(());
    }
    if let (Some(links), Some(existing)) =
        (journal["links"].as_array(), state["links"].as_array_mut())
    {
        for link in links {
            if !existing
                .iter()
                .any(|l| l["root"] == link["root"] && l["path"] == link["path"])
            {
                existing.push(link.clone());
            }
        }
    }
    Ok(())
}

pub fn clear_placement(home: &Path) -> Result<()> {
    match std::fs::remove_file(home.join("state/placement.json")) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(super::files::failure(e)),
        _ => Ok(()),
    }
}
