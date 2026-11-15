use crate::state::{files::atomic_write, records::read_sync_record};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::path::Path;

pub fn pending_repairs(home: &Path) -> Result<Vec<String>> {
    let saved = read_sync_record(&home.join("state/pending-repairs.json"), |saved| {
        serde_json::from_str::<Vec<String>>(saved).map_err(|e| {
            EnvdenError::with_source(ErrorCode::InvalidData, "Invalid pending repairs", e)
        })
    })?
    .unwrap_or_default();
    let mut unique = Vec::new();
    for id in saved {
        if !unique.contains(&id) {
            unique.push(id);
        }
    }
    Ok(unique)
}

pub fn save_pending_repairs(home: &Path, ids: &[String], now: u64) -> Result<()> {
    let bytes = serde_json::to_vec(ids).map_err(|e| {
        EnvdenError::with_source(ErrorCode::Internal, "Cannot serialize pending repairs", e)
    })?;
    atomic_write(&home.join("state/pending-repairs.json"), &bytes, now)
}

pub fn consume_repair(home: &Path, id: &str, now: u64) -> Result<()> {
    let mut pending = pending_repairs(home)?;
    pending.retain(|p| p != id);
    save_pending_repairs(home, &pending, now)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pending_repairs_keep_first_seen_order_and_reject_corruption() {
        let dir = tempfile::tempdir().unwrap();
        assert!(pending_repairs(dir.path()).unwrap().is_empty());
        save_pending_repairs(dir.path(), &["b".into(), "a".into(), "b".into()], 1).unwrap();
        assert_eq!(pending_repairs(dir.path()).unwrap(), ["b", "a"]);
        consume_repair(dir.path(), "b", 1).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.path().join("state/pending-repairs.json")).unwrap(),
            "[\"a\"]"
        );
        atomic_write(&dir.path().join("state/pending-repairs.json"), b"[1]", 1).unwrap();
        assert_eq!(
            pending_repairs(dir.path()).unwrap_err().code,
            ErrorCode::InvalidData
        );
    }
}
