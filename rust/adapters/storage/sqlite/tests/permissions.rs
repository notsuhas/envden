#[cfg(windows)]
#[test]
fn database_and_directory_do_not_inherit_parent_acl() {
    use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
    use envden_core::{
        adapters::IStorageAdapter,
        process::{ISpawnOptions, exec_trusted_sync},
    };

    let dir = tempfile::tempdir().unwrap();
    create_sqlite_storage_adapter(dir.path(), 0)
        .unwrap()
        .close()
        .unwrap();

    for path in [dir.path().to_path_buf(), dir.path().join("envden.sqlite")] {
        let output = exec_trusted_sync(
            "icacls",
            &[path.to_string_lossy().into_owned()],
            &ISpawnOptions::default(),
        )
        .unwrap();
        assert!(!output.contains("(I)"), "{output}");
    }
}
