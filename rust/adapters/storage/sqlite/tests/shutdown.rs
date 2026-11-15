#![cfg(target_os = "macos")]

use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::adapters::storage::IStorageAdapter;
use serde_json::{Value, json};
use std::{fs, process::Command};

#[test]
fn shutdown_matches_bun_checkpoint_sidecars_permissions_and_database_bytes() {
    let reference = tempfile::tempdir().unwrap();
    let directory = tempfile::tempdir().unwrap();
    let output = Command::new("bun")
        .arg(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/bridge.mjs"
        ))
        .arg("shutdown")
        .arg(reference.path())
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let expected: Value = serde_json::from_slice(&output.stdout).unwrap();
    let storage = create_sqlite_storage_adapter(directory.path(), 0).unwrap();
    storage.set_setup_token(&[7; 32]).unwrap();
    storage.close().unwrap();
    storage.close().unwrap();
    let actual: Vec<_> = ["envden.sqlite", "envden.sqlite-wal", "envden.sqlite-shm"]
        .iter()
        .map(|name| {
            use std::os::unix::fs::PermissionsExt;
            let metadata = fs::metadata(directory.path().join(name)).unwrap();
            json!({"name":name,"size":metadata.len(),"mode":metadata.permissions().mode()&0o777})
        })
        .collect();
    assert_eq!(json!(actual), expected);
    assert_eq!(
        fs::read(directory.path().join("envden.sqlite-wal")).unwrap(),
        Vec::<u8>::new()
    );
    assert_eq!(
        fs::read(directory.path().join("envden.sqlite")).unwrap(),
        fs::read(reference.path().join("envden.sqlite")).unwrap()
    );
    let output=Command::new("bun").arg("-e").arg("import {Database} from 'bun:sqlite'; const db=new Database(process.argv[1],{readonly:true}); console.log(db.query('PRAGMA journal_mode').get().journal_mode); db.close();").arg(directory.path().join("envden.sqlite")).output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(String::from_utf8(output.stdout).unwrap().trim(), "wal");
}
