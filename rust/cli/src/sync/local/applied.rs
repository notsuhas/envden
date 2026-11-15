use super::{files::base_path, reconciliation::operation::deletion::suffix};
use crate::{
    client::{binary, text},
    state::{
        files::{atomic_write, optional_read},
        records::read_sync_record,
    },
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Map, Value};
use std::path::Path;

pub fn applied_files(home: &Path) -> Result<Map<String, Value>> {
    Ok(
        read_sync_record(&home.join("state/applied-files.json"), |saved| {
            let entries: Map<String, Value> = serde_json::from_str(saved).map_err(|e| {
                EnvdenError::with_source(ErrorCode::InvalidData, "Invalid applied files", e)
            })?;
            for entry in entries.values() {
                let encoded = entry.as_str().ok_or_else(|| {
                    EnvdenError::new(ErrorCode::InvalidData, "Invalid applied files")
                })?;
                let _: p::IFileEntry = p::decode(&binary(encoded)?)?;
            }
            Ok(entries)
        })?
        .unwrap_or_default(),
    )
}

pub fn save_applied_files(home: &Path, files: Map<String, Value>, now: u64) -> Result<()> {
    let path = home.join("state/applied-files.json");
    let bytes = Value::Object(files).to_string();
    if optional_read(&path)?.as_deref() == Some(&bytes) {
        return Ok(());
    }
    atomic_write(&path, bytes.as_bytes(), now)
}

pub fn has_applied_entry(
    home: &Path,
    entry: &p::IFileEntry,
    files: Option<&Map<String, Value>>,
) -> Result<bool> {
    let owned;
    let files = match files {
        Some(files) => files,
        None => {
            owned = applied_files(home)?;
            &owned
        }
    };
    Ok(files
        .get(&p::base32(&entry.file_id))
        .and_then(Value::as_str)
        == Some(text(&p::encode(entry)?).as_str()))
}

pub fn mark_applied_entry(home: &Path, encoded: &str, store: Option<&str>, now: u64) -> Result<()> {
    if let Some(store) = store.filter(|s| !s.is_empty()) {
        atomic_write(
            &suffix(&base_path(home, store, None), ".entry"),
            encoded.as_bytes(),
            now,
        )?;
    }
    let entry: p::IFileEntry = p::decode(&binary(encoded)?)?;
    let mut applied = applied_files(home)?;
    applied.insert(p::base32(&entry.file_id), encoded.into());
    save_applied_files(home, applied, now)
}
