use envden_core::adapters::IStorageAdapter;
use std::{fs, io::Write, process::Command};

thread_local! {
    static STAGE: std::cell::Cell<Option<&'static str>> = const { std::cell::Cell::new(None) };
}

pub(super) fn exit_at(stage: &str, file: &mut fs::File) {
    if STAGE.get() == Some(stage) {
        if stage == "partial" {
            file.write_all(&[3]).unwrap();
            file.sync_all().unwrap();
        }
        std::process::exit(77);
    }
}

#[test]
fn crash_child() {
    let Some(dir) = std::env::var_os("ENVDEN_BLOB_CRASH_DIR") else {
        return;
    };
    let db = crate::create_sqlite_storage_adapter(dir, 0).unwrap();
    STAGE.set(Some(
        if std::env::var("ENVDEN_BLOB_CRASH_STAGE").unwrap() == "partial" {
            "partial"
        } else {
            "published"
        },
    ));
    db.put_blob(&[1], &[2], &[3, 4, 5], None, None, None)
        .unwrap();
    panic!("Crash injection did not execute");
}

#[test]
fn process_exit_during_real_blob_write_leaves_no_visible_partial_object() {
    for stage in ["partial", "published"] {
        let dir = tempfile::tempdir().unwrap();
        let output = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "blobs::objects::tests::crash_child"])
            .env("ENVDEN_BLOB_CRASH_DIR", dir.path())
            .env("ENVDEN_BLOB_CRASH_STAGE", stage)
            .output()
            .unwrap();
        assert_eq!(output.status.code(), Some(77), "{output:?}");
        let db = crate::create_sqlite_storage_adapter(dir.path(), 0).unwrap();
        assert!(db.get_blob(&[1], &[2]).unwrap().is_none());
        db.put_blob(&[1], &[2], &[3, 4, 5], None, None, None)
            .unwrap();
        assert_eq!(db.get_blob(&[1], &[2]).unwrap(), Some(vec![3, 4, 5]));
        db.close().unwrap();
    }
}
