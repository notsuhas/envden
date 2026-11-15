use crate::{
    client::binary,
    state::{
        files::{atomic_write, optional_read},
        records::recover_sync_record,
    },
    sync::local::files::{base_path, write_bytes},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::{self as p, IFileEntry};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize)]
pub struct IDeletion {
    pub entry: String,
    pub targets: Vec<String>,
}

pub fn suffix(path: &Path, suffix: &str) -> PathBuf {
    PathBuf::from(format!("{}{suffix}", path.display()))
}

pub fn decode_deletion(saved: &str) -> Result<IDeletion> {
    let intent: IDeletion = serde_json::from_str(saved).map_err(|e| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid deletion intent", e)
    })?;
    let _: IFileEntry = p::decode(&binary(&intent.entry)?)?;
    Ok(intent)
}

pub fn read_deletion(home: &Path, store: &str, now: u64) -> Result<Option<IDeletion>> {
    let base = base_path(home, store, None);
    recover_sync_record(
        &suffix(&base, ".delete"),
        &suffix(&base, ".corrupt"),
        decode_deletion,
        now,
        |m| eprintln!("{m}"),
    )
}

pub fn request_deletion(
    home: &Path,
    store: &str,
    requested: bool,
    entry: Option<&str>,
    targets: Option<Vec<String>>,
    now: u64,
) -> Result<()> {
    let base = base_path(home, store, None);
    let path = suffix(&base, ".delete");
    if !requested {
        return write_bytes(&path, None, now);
    }
    let previous = read_deletion(home, store, now)?;
    let ancestor = match entry {
        Some(entry) => Some(entry.to_owned()),
        None => optional_read(&suffix(&base, ".entry"))?,
    };
    if let Some(entry) = ancestor.filter(|s| !s.is_empty()) {
        let intent = IDeletion {
            entry,
            targets: targets
                .or_else(|| previous.map(|p| p.targets))
                .unwrap_or_default(),
        };
        let text = serde_json::to_string(&intent).map_err(|e| {
            EnvdenError::with_source(ErrorCode::Internal, "Cannot serialize deletion intent", e)
        })?;
        atomic_write(&path, text.as_bytes(), now)?;
    }
    Ok(())
}
