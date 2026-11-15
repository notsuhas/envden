mod support;
#[path = "support/swap.rs"]
mod swap;
use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::adapters::*;
use rusqlite::Connection;
use serde_json::{Value, json};
use std::{path::Path, process::Command};

fn bun(mode: &str, dir: &Path) {
    let output = Command::new("bun")
        .arg(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/bridge.mjs"
        ))
        .arg(mode)
        .arg(dir)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}
#[test]
fn exact_typescript_schema_and_pragmas() {
    let (dir, storage) = support::setup();
    let db = Connection::open(dir.path().join("envden.sqlite")).unwrap();
    let schema: Vec<Value> = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY name").unwrap().query_map([], |r| Ok(json!({"type": r.get::<_, String>(0)?, "name": r.get::<_, String>(1)?, "tbl_name": r.get::<_, String>(2)?, "sql": r.get::<_, Option<String>>(3)?}))).unwrap().map(Result::unwrap).collect();
    assert_eq!(
        json!(schema),
        serde_json::from_str::<Value>(include_str!("fixtures/schema.json")).unwrap()
    );
    assert_eq!(
        db.query_row("PRAGMA journal_mode", [], |r| r.get::<_, String>(0))
            .unwrap(),
        "wal"
    );
    assert_eq!(
        db.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert!(std::fs::read_dir(dir.path()).unwrap().all(|entry| {
        !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("pre-")
    }));
    for (table, column) in [
        ("nonces", "expires"),
        ("sessions", "expires"),
        ("approvers", "expires"),
        ("headers", "files"),
        ("charges", "at"),
        ("charges", "bucket"),
        ("buckets", "until"),
    ] {
        let columns: Vec<String> = db
            .prepare(&format!("PRAGMA index_info({table}_{column})"))
            .unwrap()
            .query_map([], |r| r.get(2))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(columns.contains(&column.to_string()));
    }
    assert!(!dir.path().join("pre-1").exists());
    assert!(dir.path().join("envden.sqlite-wal").exists());
    assert!(dir.path().join("envden.sqlite-shm").exists());
    drop(storage);
}
#[test]
fn databases_are_readable_in_both_runtimes() {
    let dir = tempfile::tempdir().unwrap();
    bun("write", dir.path());
    let storage = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
    assert_eq!(
        storage.vault(&[1]).unwrap().unwrap().unlock_period,
        Some(123)
    );
    assert_eq!(
        storage.device(&[1], &[2]).unwrap().unwrap().unlocked_until,
        100
    );
    assert_eq!(
        storage.state(&[1], TStateKind::Keyring, &[3]).unwrap(),
        Some(vec![4])
    );
    assert_eq!(storage.get_blob(&[1], &[5]).unwrap(), Some(vec![6]));
    assert_eq!(
        storage.headers(&[1], 0, u64::MAX, None, None).unwrap()[0].seq,
        u64::MAX
    );
    for kind in [
        TStateKind::Keyring,
        TStateKind::Envelope,
        TStateKind::SkPub,
        TStateKind::OpaqueRecord,
        TStateKind::RepairReport,
        TStateKind::MoveSession,
        TStateKind::SetupIssued,
        TStateKind::ServerIdentity,
        TStateKind::PairingIndex,
        TStateKind::MailboxJoiner,
    ] {
        assert_eq!(storage.state(&[1], kind, &[3]).unwrap(), Some(vec![4]));
    }
    storage.close().unwrap();
    let (dir, storage) = support::setup();
    storage
        .configure_vault(
            &[1],
            &IStoredVault {
                unlock_period: Some(123),
                ..support::vault(true)
            },
            &[],
            None,
        )
        .unwrap();
    storage
        .put_device(
            &[1],
            &[2],
            &IStoredDevice {
                unlocked_until: 100,
                fresh_until: 50,
                client_version: "1.0.0".into(),
                mailbox_grant: None,
            },
        )
        .unwrap();
    storage
        .write_state(
            &[1],
            &[IStateWrite {
                kind: TStateKind::Keyring,
                key: vec![3],
                bytes: Some(vec![4]),
            }],
        )
        .unwrap();
    storage
        .put_blob(&[1], &[5], &[6], None, None, None)
        .unwrap();
    let mut swap = swap::swap(7);
    swap.header.seq = u64::MAX;
    swap.header.bytes = vec![8];
    swap.vault = None;
    storage.commit_swap(&[1], None, &swap, 1).unwrap();
    for kind in [
        TStateKind::Keyring,
        TStateKind::Envelope,
        TStateKind::SkPub,
        TStateKind::OpaqueRecord,
        TStateKind::RepairReport,
        TStateKind::MoveSession,
        TStateKind::SetupIssued,
        TStateKind::ServerIdentity,
        TStateKind::PairingIndex,
        TStateKind::MailboxJoiner,
    ] {
        storage
            .write_state(
                &[1],
                &[IStateWrite {
                    kind,
                    key: vec![3],
                    bytes: Some(vec![4]),
                }],
            )
            .unwrap();
    }
    storage.close().unwrap();
    bun("read", dir.path());
}
