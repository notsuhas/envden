mod support;
use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::adapters::*;
use rusqlite::{Connection, params};
use std::{fs, process::Command};

fn verified_hash(dir: &std::path::Path) -> Vec<u8> {
    let output = Command::new("bun")
        .arg(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/bridge.mjs"
        ))
        .arg("hash")
        .arg(dir)
        .output()
        .unwrap();
    assert!(output.status.success());
    hex::decode(output.stdout).unwrap()
}
#[test]
fn adopts_verified_orphans_removes_invalid_and_temporary_files() {
    let dir = tempfile::tempdir().unwrap();
    let hash = verified_hash(dir.path());
    let path = dir.path().join("blobs/01");
    fs::create_dir_all(&path).unwrap();
    fs::write(path.join(hex::encode(&hash)), [6]).unwrap();
    fs::write(path.join("02"), [3]).unwrap();
    fs::write(path.join(".tmp-interrupted"), [9]).unwrap();
    let storage = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
    assert_eq!(storage.get_blob(&[1], &hash).unwrap(), Some(vec![6]));
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
        let hash = verified_hash(dir.path());
        db.put_blob(&[1], &hash, &[6], None, None, None).unwrap();
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
            present.then_some(vec![6])
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
}
#[test]
fn live_maintenance_prunes_expired_secrets_and_backups() {
    let (dir, db) = support::setup();
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
    fs::write(dir.path().join("pre-1"), "backup").unwrap();
    fs::File::open(dir.path().join("pre-1"))
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(std::time::UNIX_EPOCH))
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
}
