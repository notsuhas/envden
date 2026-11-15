use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::adapters::IStorageAdapter;
use std::{fs, process::Command};

#[test]
fn child_write() {
    let Some(dir) = std::env::var_os("ENVDEN_SQLITE_CRASH_DIR") else {
        return;
    };
    let dir = std::path::PathBuf::from(dir);
    let _storage = create_sqlite_storage_adapter(&dir, 0).unwrap();
    let path = dir.join("blobs/01");
    fs::create_dir_all(&path).unwrap();
    let file = if std::env::var("ENVDEN_SQLITE_CRASH_STAGE").unwrap() == "partial" {
        ".tmp-crash"
    } else {
        "02"
    };
    fs::write(path.join(file), [9]).unwrap();
    fs::File::open(path.join(file)).unwrap().sync_all().unwrap();
    std::process::exit(77);
}
#[test]
fn abrupt_exit_does_not_publish_partial_objects() {
    for stage in ["partial", "published"] {
        let dir = tempfile::tempdir().unwrap();
        let status = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "child_write"])
            .env("ENVDEN_SQLITE_CRASH_DIR", dir.path())
            .env("ENVDEN_SQLITE_CRASH_STAGE", stage)
            .output()
            .unwrap()
            .status;
        assert_eq!(status.code(), Some(77));
        let storage = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
        assert!(storage.get_blob(&[1], &[2]).unwrap().is_none());
        storage
            .put_blob(&[1], &[2], &[3, 4, 5], None, None, None)
            .unwrap();
        assert_eq!(storage.get_blob(&[1], &[2]).unwrap(), Some(vec![3, 4, 5]));
        assert!(!dir.path().join("blobs/01/.tmp-crash").exists());
        storage.close().unwrap();
    }
}
