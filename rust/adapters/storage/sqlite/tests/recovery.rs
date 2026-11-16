mod support;
use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::adapters::*;
use rusqlite::{Connection, params};
use std::fs;

fn verified_hash() -> Vec<u8> {
    hex::decode("73bb395871b361f25d9758a2f06c8ab5c994d4befa96c1da5defd0ceb67a3d31").unwrap()
}

#[test]
fn adopts_verified_orphans_removes_invalid_and_temporary_files() {
    let dir = tempfile::tempdir().unwrap();
    let hash = verified_hash();
    let path = dir.path().join("blobs/01");
    fs::create_dir_all(&path).unwrap();
    fs::write(path.join(hex::encode(&hash)), [4, 5, 6]).unwrap();
    fs::write(path.join("02"), [3]).unwrap();
    fs::write(path.join(".tmp-interrupted"), [9]).unwrap();
    let storage = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
    assert_eq!(storage.get_blob(&[1], &hash).unwrap(), Some(vec![4, 5, 6]));
    assert!(storage.get_blob(&[1], &[2]).unwrap().is_none());
    assert!(!path.join("02").exists());
    assert!(!path.join(".tmp-interrupted").exists());
    storage
        .put_blob(&[1], &[2], &[3], None, None, None)
        .unwrap();
    assert_eq!(fs::read(path.join("02")).unwrap(), vec![3]);
}
#[test]
fn honors_pending_garbage_and_preserves_reuploads() {
    for present in [false, true] {
        let (dir, db) = support::setup();
        let hash = verified_hash();
        db.put_blob(&[1], &hash, &[4, 5, 6], None, None, None)
            .unwrap();
        db.close().unwrap();
        let inspect = Connection::open(dir.path().join("envden.sqlite")).unwrap();
        if !present {
            inspect
                .execute_batch("DELETE FROM blobs; DELETE FROM blob_usage")
                .unwrap();
        }
        inspect
            .execute(
                "INSERT INTO blob_garbage VALUES(?,?)",
                params![&[1_u8], hash],
            )
            .unwrap();
        drop(inspect);
        let storage = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
        assert_eq!(
            storage.get_blob(&[1], &hash).unwrap(),
            present.then_some(vec![4, 5, 6])
        );
        assert_eq!(
            dir.path().join("blobs/01").join(hex::encode(hash)).exists(),
            present
        );
    }
}
#[test]
fn failed_garbage_deletion_is_durable_and_retried() {
    let (dir, db) = support::setup();
    db.configure_vault(&[1], &support::vault(false), &[], None)
        .unwrap();
    db.put_blob(&[1], &[2], &[3], None, None, None).unwrap();
    let path = dir.path().join("blobs/01/02");
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    db.transaction(&mut || db.discard_inactive_vault(&[1]))
        .unwrap();
    assert!(!db.has_vault(&[1]).unwrap());
    let inspect = Connection::open(dir.path().join("envden.sqlite")).unwrap();
    assert_eq!(
        inspect
            .query_row("SELECT COUNT(*) FROM blob_garbage", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
    fs::remove_dir(&path).unwrap();
    fs::write(&path, [3]).unwrap();
    db.prune(
        &[1],
        &IHistoryPolicy {
            max_age: 0,
            min_versions: 1,
        },
        0,
    )
    .unwrap();
    assert!(!path.exists());
    assert_eq!(
        inspect
            .query_row("SELECT COUNT(*) FROM blob_garbage", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
    db.configure_vault(&[1], &support::vault(false), &[], None)
        .unwrap();
    db.put_blob(&[1], &[2], &[3], None, None, None).unwrap();
    db.discard_inactive_vault(&[1]).unwrap();
    assert!(!path.exists());
}
#[test]
fn live_maintenance_prunes_expired_secrets_and_backups() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("envden.sqlite");
    let original = Connection::open(&path).unwrap();
    original
        .execute_batch("CREATE TABLE fixture(value); INSERT INTO fixture VALUES(42)")
        .unwrap();
    drop(original);
    fs::write(dir.path().join("pre-1"), "partial").unwrap();
    let db = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
    let backup = Connection::open(dir.path().join("pre-1")).unwrap();
    assert_eq!(
        backup
            .query_row("SELECT value FROM fixture", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        42
    );
    drop(backup);
    let key = ISessionKey {
        kind: TSessionKind::Login,
        device: vec![1],
        purpose: "unlock".into(),
    };
    db.put_session(&[1], &key, &[2], 0).unwrap();
    let inspect = Connection::open(dir.path().join("envden.sqlite")).unwrap();
    inspect
        .execute_batch("INSERT INTO approvers VALUES(x'01',x'01',x'02',100)")
        .unwrap();
    envden_testing::fixtures::set_modified(&dir.path().join("pre-1"), std::time::UNIX_EPOCH)
        .unwrap();
    db.remember_nonce(&[1], &[2], 30 * 86400000).unwrap();
    for table in ["sessions", "approvers"] {
        assert_eq!(
            inspect
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    assert!(!dir.path().join("pre-1").exists());
    assert_eq!(
        inspect
            .query_row(
                "SELECT name FROM sqlite_master WHERE name='nonces_expires'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
        "nonces_expires"
    );
}
