mod support;
#[path = "support/swap.rs"]
mod swap;
use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::adapters::*;
use rusqlite::Connection;
use std::{
    fs,
    sync::{Arc, Barrier},
};

#[test]
fn migrates_with_consistent_wal_backup_and_replaces_partial_backup() {
    let dir = tempfile::tempdir().unwrap();
    let db = Connection::open(dir.path().join("envden.sqlite")).unwrap();
    db.execute_batch(
        "PRAGMA journal_mode=WAL; CREATE TABLE fixture(value); INSERT INTO fixture VALUES(42)",
    )
    .unwrap();
    fs::write(dir.path().join("pre-1"), "partial").unwrap();
    let storage = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
    let backup = Connection::open(dir.path().join("pre-1")).unwrap();
    assert_eq!(
        backup
            .query_row("SELECT value FROM fixture", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        42
    );
    assert_eq!(
        backup
            .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    drop(backup);
    drop(db);
    storage.close().unwrap();
    fs::File::open(dir.path().join("pre-1"))
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(std::time::UNIX_EPOCH))
        .unwrap();
    let storage = create_sqlite_storage_adapter(dir.path(), 30 * 86400000).unwrap();
    assert!(!dir.path().join("pre-1").exists());
    storage.close().unwrap();
}
#[test]
fn rejects_incompatible_versions() {
    for version in [-1, 2] {
        let dir = tempfile::tempdir().unwrap();
        let db = Connection::open(dir.path().join("envden.sqlite")).unwrap();
        db.execute_batch(&format!("PRAGMA user_version={version}"))
            .unwrap();
        drop(db);
        let error = create_sqlite_storage_adapter(dir.path(), 0).err().unwrap();
        assert_eq!(error.message, "Incompatible server database format");
    }
}
#[test]
fn concurrent_connections_have_exactly_one_cas_winner() {
    let (dir, db) = support::setup();
    db.close().unwrap();
    let barrier = Arc::new(Barrier::new(2));
    let handles: Vec<_> = (1..=2)
        .map(|i| {
            let barrier = barrier.clone();
            let dir = dir.path().to_path_buf();
            std::thread::spawn(move || {
                let db = create_sqlite_storage_adapter(dir, 0).unwrap();
                barrier.wait();
                db.commit_swap(&[1], None, &swap::swap(i), 0).unwrap()
            })
        })
        .collect();
    let values: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    assert_eq!(
        values
            .iter()
            .filter(|r| **r == TCommitResult::Committed)
            .count(),
        1
    );
    assert_eq!(
        values
            .iter()
            .filter(|r| matches!(r, TCommitResult::HeadMoved { .. }))
            .count(),
        1
    );
}
#[test]
fn startup_repairs_private_modes() {
    let (dir, storage) = support::setup();
    storage.close().unwrap();
    fs::write(dir.path().join("identity.json"), "{}").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for path in [
            dir.path().to_path_buf(),
            dir.path().join("identity.json"),
            dir.path().join("envden.sqlite"),
        ] {
            fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
        }
    }
    let storage = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(dir.path()).unwrap().permissions().mode() & 0o777,
            0o700
        );
        for name in [
            "identity.json",
            "envden.sqlite",
            "envden.sqlite-wal",
            "envden.sqlite-shm",
        ] {
            assert_eq!(
                fs::metadata(dir.path().join(name))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
    }
    storage.close().unwrap();
}
#[test]
fn login_transaction_rolls_back_all_effects() {
    let (_dir, db) = support::setup();
    db.configure_vault(&[1], &support::vault(true), &[], None)
        .unwrap();
    let key = ISessionKey {
        kind: TSessionKind::Login,
        device: vec![2],
        purpose: "unlock".into(),
    };
    db.put_session(&[1], &key, &[9], 0).unwrap();
    let TRateCharge::Charged { receipt } = db
        .charge(&[1], &TRateBucket::Member { device: vec![2] }, 0)
        .unwrap()
    else {
        panic!()
    };
    assert!(
        db.transaction(&mut || {
            db.consume_session(&[1], &key, 1)?;
            db.put_device(&[1], &[2], &IStoredDevice::default())?;
            db.refund(&receipt, 1)?;
            Err(envden_core::errors::EnvdenError::new(
                envden_core::errors::ErrorCode::InvalidInput,
                "Login rejected",
            ))
        })
        .is_err()
    );
    assert!(db.session(&[1], &key, 1).unwrap().is_some());
    assert!(db.device(&[1], &[2]).unwrap().is_none());
    assert!(db.refund(&receipt, 1).unwrap());
}
