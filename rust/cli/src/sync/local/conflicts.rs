use crate::{
    state::{files::atomic_write, records::read_sync_record},
    sync::local::files::{base_path, read_bytes},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IConflictTarget {
    pub root: String,
    pub path: String,
    pub store: String,
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_only: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IConflictRecord {
    pub remote: String,
    pub alternatives: Vec<String>,
    pub targets: Vec<IConflictTarget>,
    #[serde(deserialize_with = "nullable_entry")]
    pub entry: Option<String>,
    pub store: String,
    pub root: String,
    pub path: String,
    pub mode: String,
    pub base: String,
    pub file: String,
    pub server: String,
    pub mine: String,
    pub deleted: bool,
    pub mine_deleted: bool,
}

#[derive(Serialize, Deserialize)]
struct IConflictDocument {
    model: String,
    records: Vec<IConflictRecord>,
}

pub fn conflict_records(home: &Path) -> Result<Vec<IConflictRecord>> {
    Ok(
        read_sync_record(&home.join("state/conflicts.json"), |text| {
            let document: IConflictDocument = serde_json::from_str(text).map_err(invalid)?;
            if document.model != "shared-store"
                || document.records.iter().any(|r| {
                    !valid_mode(&r.mode)
                        || r.targets
                            .iter()
                            .any(|t| !valid_mode(&t.mode) || t.local_only == Some(false))
                })
            {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidData,
                    "Invalid conflict records",
                ));
            }
            Ok(document.records)
        })?
        .unwrap_or_default(),
    )
}

fn valid_mode(mode: &str) -> bool {
    matches!(mode, "copy" | "link")
}

pub fn save_conflicts(home: &Path, records: &[IConflictRecord], now: u64) -> Result<()> {
    let document = serde_json::json!({"model":"shared-store","records":records});
    atomic_write(
        &home.join("state/conflicts.json"),
        document.to_string().as_bytes(),
        now,
    )
}

pub fn backup(home: &Path, path: &Path, now: u64) -> Result<Option<PathBuf>> {
    let Some(bytes) = read_bytes(path)? else {
        return Ok(None);
    };
    let saved = home
        .join("conflicts/backups")
        .join(format!("{now:013}_{}", uuid::Uuid::new_v4()));
    atomic_write(&saved, &bytes, now)?;
    Ok(Some(saved))
}

pub fn remove_conflict_targets(home: &Path, root: &str, now: u64) -> Result<()> {
    let records = conflict_records(home)?;
    if !records
        .iter()
        .any(|r| r.targets.iter().any(|t| t.root == root))
    {
        return Ok(());
    }
    let mut retained = Vec::new();
    for mut record in records {
        if !record.targets.iter().any(|t| t.root == root) {
            retained.push(record);
            continue;
        }
        record.targets.retain(|t| t.root != root);
        if record.targets.is_empty() {
            continue;
        }
        let stored = read_bytes(Path::new(&record.store))?;
        let base = read_bytes(Path::new(&record.base))?;
        let mut divergent = false;
        for target in &record.targets {
            let path = Path::new(&target.root).join(&target.path);
            if !std::fs::symlink_metadata(&path).is_ok_and(|m| m.is_file()) {
                continue;
            }
            let bytes = read_bytes(&path)?;
            if bytes.is_some()
                && bytes != stored
                && bytes
                    != read_bytes(&base_path(
                        home,
                        &record.store,
                        if target.mode == "copy" {
                            Some(&target.root)
                        } else {
                            None
                        },
                    ))?
            {
                divergent = true;
            }
        }
        if stored != base || divergent {
            retained.push(record);
        }
    }
    save_conflicts(home, &retained, now)
}

fn invalid(error: serde_json::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::InvalidData, "Invalid conflict records", error)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_and_malformed_records() {
        let dir = tempfile::tempdir().unwrap();
        assert!(conflict_records(dir.path()).unwrap().is_empty());
        save_conflicts(dir.path(), &[], 1).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.path().join("state/conflicts.json")).unwrap(),
            "{\"model\":\"shared-store\",\"records\":[]}"
        );
        atomic_write(&dir.path().join("state/conflicts.json"), b"{}", 1).unwrap();
        assert!(
            conflict_records(dir.path())
                .unwrap_err()
                .message
                .contains("Invalid sync state:")
        );
    }
}

fn nullable_entry<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<String>, D::Error> {
    Option::<String>::deserialize(deserializer)
}

pub mod record;
pub mod render;
