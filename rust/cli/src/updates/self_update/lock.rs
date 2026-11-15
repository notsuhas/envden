use crate::state::lock::{ILockTiming, with_state_lock_timing};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{cell::Cell, path::Path};

pub(super) fn with_update_lock<T>(
    home: &Path,
    now: &dyn Fn() -> u64,
    action: impl FnOnce() -> Result<T>,
) -> Result<T> {
    let acquired = Cell::new(false);
    let result = with_state_lock_timing(
        &home.join("state/update"),
        &ILockTiming {
            now,
            wait: &|_| {},
            delays: &[],
        },
        || {
            acquired.set(true);
            action()
        },
    );

    match result {
        Err(error) if !acquired.get() && error.code == ErrorCode::Conflict => Err(
            EnvdenError::new(ErrorCode::Conflict, "Another envden update is running"),
        ),
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_lock_conflicts_are_translated_only_before_acquisition() {
        let dir = tempfile::tempdir().unwrap();
        let lock = dir.path().join("state/update/state/write.lock");
        std::fs::create_dir_all(&lock).unwrap();
        std::fs::write(
            lock.join("owner.json"),
            r#"{"pid":1,"token":"live","startedAt":"live","createdAt":9007199254740991}"#,
        )
        .unwrap();
        let error = with_update_lock(dir.path(), &|| 100, || -> Result<()> {
            panic!("occupied lock")
        })
        .unwrap_err();
        assert_eq!(error.code, ErrorCode::Conflict);
        assert_eq!(error.message, "Another envden update is running");
        std::fs::remove_dir_all(lock).unwrap();
        let error = with_update_lock(dir.path(), &|| 100, || -> Result<()> {
            Err(EnvdenError::new(ErrorCode::Conflict, "Action conflict"))
        })
        .unwrap_err();
        assert_eq!(error.message, "Action conflict");
    }
}
