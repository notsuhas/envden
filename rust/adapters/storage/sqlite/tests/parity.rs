#[path = "support/ts_written.rs"]
mod ts_written;
use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::adapters::*;
use rusqlite::Connection;
use serde_json::{Value, json};

#[test]
fn exact_typescript_schema_and_pragmas() {
    let dir = tempfile::tempdir().unwrap();
    let storage = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
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
fn reads_a_database_written_by_the_typescript_adapter() {
    let dir = tempfile::tempdir().unwrap();
    ts_written::copy_into(dir.path());
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
}
