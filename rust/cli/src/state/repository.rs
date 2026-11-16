use super::{
    TLocalState,
    files::{atomic_write, optional_read, private_directory},
    lock::with_state_lock,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::Path;

const KEYS: &[&str] = &[
    "format",
    "verifiedState",
    "aliasAsked",
    "deviceName",
    "vaultId",
    "creationPending",
    "server",
    "checkpoint",
    "headerRefs",
    "entries",
    "keyring",
    "files",
    "session",
    "approved",
    "links",
    "aliases",
    "telemetry",
    "updateCheck",
];

pub fn save_state(home: &Path, state: &TLocalState, now: u64) -> Result<()> {
    with_state_lock(home, now, || {
        private_directory(home)?;
        let mut record = state.as_object().cloned().ok_or_else(unreadable)?;
        let headers = record
            .shift_remove("headers")
            .and_then(|v| v.as_array().cloned())
            .ok_or_else(unreadable)?;
        record.shift_remove("latest");
        let mut refs = Vec::new();
        for header in headers {
            let text = header.as_str().ok_or_else(unreadable)?;
            let hash = format!("{:x}", Sha256::digest(text.as_bytes()));
            let path = home.join("state/headers").join(&hash);
            if optional_read(&path)?.is_none() {
                atomic_write(&path, text.as_bytes(), now)?;
            }
            refs.push(Value::String(hash));
        }
        record.insert("headerRefs".into(), Value::Array(refs));
        atomic_write(
            &home.join("state/device.json"),
            Value::Object(record).to_string().as_bytes(),
            now,
        )?;
        super::journal::clear_placement(home)
    })
}

pub fn load_state(home: &Path) -> Result<Option<TLocalState>> {
    let Some(text) = optional_read(&home.join("state/device.json"))? else {
        return Ok(None);
    };
    let restore = || -> Result<Value> {
        let mut value: Value = serde_json::from_str(&text).map_err(|e| {
            EnvdenError::with_source(ErrorCode::InvalidData, "Unreadable local state", e)
        })?;
        let record = value.as_object_mut().ok_or_else(unreadable)?;
        if record.keys().any(|k| !KEYS.contains(&k.as_str()))
            || record.get("format") != Some(&Value::from(1))
            || !record.get("deviceName").is_some_and(Value::is_string)
            || ["headerRefs", "entries", "approved", "links"]
                .iter()
                .any(|k| !record.get(*k).is_some_and(Value::is_array))
            || !record.get("aliases").is_some_and(Value::is_object)
            || ["telemetry", "updateCheck"]
                .iter()
                .any(|k| !record.get(*k).is_some_and(Value::is_boolean))
        {
            return Err(unreadable());
        }
        let refs = record.shift_remove("headerRefs").ok_or_else(unreadable)?;
        let mut headers = Vec::new();
        for hash in refs.as_array().ok_or_else(unreadable)? {
            let hash = hash.as_str().ok_or_else(unreadable)?;
            if hash.len() != 64
                || !hash
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            {
                return Err(unreadable());
            }
            let header =
                optional_read(&home.join("state/headers").join(hash))?.ok_or_else(unreadable)?;
            if format!("{:x}", Sha256::digest(header.as_bytes())) != hash {
                return Err(unreadable());
            }
            headers.push(Value::String(header));
        }
        record.insert("headers".into(), Value::Array(headers));
        Ok(value)
    };
    restore()
        .and_then(|mut state| {
            if let Some(latest) = crate::updates::cache::read_update_cache(home)
                .latest
                .filter(|value| !value.is_empty())
            {
                state["latest"] = latest.into();
            }
            super::journal::restore_placement(home, &mut state)?;
            Ok(state)
        })
        .map(Some)
        .map_err(|e| EnvdenError::with_source(ErrorCode::InvalidData, "Unreadable local state", e))
}

fn unreadable() -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, "Unreadable local state")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restores_latest_from_update_cache_without_persisting_it() {
        let temp = tempfile::tempdir().unwrap();
        let mut state = super::super::empty_state("test");
        state["latest"] = "0.0.1".into();
        save_state(temp.path(), &state, 42).unwrap();
        crate::updates::cache::save_update_cache(
            temp.path(),
            &crate::updates::cache::IUpdateCache {
                latest: Some("1.2.3".into()),
                ..Default::default()
            },
            42,
        )
        .unwrap();
        let restored = load_state(temp.path()).unwrap().unwrap();
        assert_eq!(restored["latest"], "1.2.3");
        let saved: Value =
            serde_json::from_slice(&std::fs::read(temp.path().join("state/device.json")).unwrap())
                .unwrap();
        assert!(saved.get("latest").is_none());
    }

    #[test]
    fn roundtrip_and_header_integrity() {
        let temp = tempfile::tempdir().unwrap();
        let mut state = super::super::empty_state("test");
        state["headers"] = serde_json::json!(["one", "two", "one"]);
        save_state(temp.path(), &state, 123).unwrap();
        assert_eq!(load_state(temp.path()).unwrap(), Some(state));
        let hash = format!("{:x}", Sha256::digest(b"one"));
        std::fs::write(temp.path().join("state/headers").join(hash), "changed").unwrap();
        assert_eq!(
            load_state(temp.path()).unwrap_err().message,
            "Unreadable local state"
        );
    }
    #[test]
    fn strict_format() {
        let temp = tempfile::tempdir().unwrap();
        assert!(load_state(temp.path()).unwrap().is_none());
        atomic_write(&temp.path().join("state/device.json"), b"{}", 0).unwrap();
        assert!(load_state(temp.path()).is_err());
    }
}
