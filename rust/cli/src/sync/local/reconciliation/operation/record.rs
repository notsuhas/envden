use super::{deletion::suffix, guards::content_hash};
use crate::{
    client::binary,
    state::{files::atomic_write, records::recover_sync_record},
    sync::local::{
        conflicts::IConflictTarget,
        files::{base_path, read_bytes},
    },
};
use base64::{Engine, engine::general_purpose::STANDARD};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize)]
pub struct IOperation {
    pub targets: Vec<IConflictTarget>,
    pub before: Vec<Option<String>>,
    pub written: Vec<bool>,
    #[serde(deserialize_with = "nullable_string")]
    pub next: Option<String>,
    #[serde(deserialize_with = "nullable_string")]
    pub server: Option<String>,
    pub header: String,
    #[serde(deserialize_with = "nullable_string")]
    pub entry: Option<String>,
}

pub fn decode_operation(text: &str) -> Result<IOperation> {
    let operation: IOperation = serde_json::from_str(text).map_err(|e| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid placement record", e)
    })?;
    if let Some(entry) = operation.entry.as_deref().filter(|e| !e.is_empty()) {
        let _: p::IFileEntry = p::decode(&binary(entry)?)?;
    }
    if operation.before.len() != operation.targets.len() + 1
        || operation.written.len() != operation.before.len()
        || operation.header.len() != 43
        || !operation
            .header
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        || operation
            .targets
            .iter()
            .any(|t| !matches!(t.mode.as_str(), "link" | "copy"))
    {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Invalid placement record",
        ));
    }
    Ok(operation)
}

pub fn preserve_pending_ancestor(home: &Path, store: &str, now: u64) -> Result<()> {
    let base = base_path(home, store, None);
    let operation = recover_sync_record(
        &suffix(&base, ".pending"),
        &suffix(&base, ".corrupt"),
        decode_operation,
        now,
        |m| eprintln!("{m}"),
    )?;
    let Some(operation) = operation else {
        return Ok(());
    };
    let next = operation
        .next
        .as_deref()
        .map(|s| {
            STANDARD.decode(s).map_err(|e| {
                EnvdenError::with_source(ErrorCode::InvalidData, "Invalid placement record", e)
            })
        })
        .transpose()?;
    if let Some(entry) = operation.entry.filter(|e| !e.is_empty())
        && content_hash(read_bytes(Path::new(store))?.as_deref()) == content_hash(next.as_deref())
    {
        atomic_write(&suffix(&base, ".entry"), entry.as_bytes(), now)?;
    }
    Ok(())
}

fn nullable_string<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<String>, D::Error> {
    Option::<String>::deserialize(deserializer)
}
