#[test]
fn contract() {
    envden_testing::keychain::keychain_contract(|home| {
        Box::new(envden_adapter_keychain_file::create_file_keychain_adapter(
            home,
        ))
    });
}

#[test]
fn permissions_and_required() {
    use envden_core::{adapters::IKeychainAdapter, errors::ErrorCode};
    let home = tempfile::tempdir().unwrap();
    let adapter = envden_adapter_keychain_file::create_file_keychain_adapter(home.path());
    let missing = adapter.get("device", true).unwrap_err();
    assert_eq!(missing.code, ErrorCode::Locked);
    assert!(missing.message.contains("run envden join"));
    assert!(adapter.owner_only().unwrap());
    adapter.set("key", &[1]).unwrap();
    let directory = home.path().join("state/keys");
    let paths: Vec<_> = std::fs::read_dir(&directory)
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    assert_eq!(paths.len(), 1);
    assert_eq!(
        paths[0].file_name().unwrap(),
        "2c70e12b7a0646f92279f427c7b38e7334d8e5389cff167a1dc30e73f826b683.key"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            std::fs::metadata(&paths[0]).unwrap().permissions().mode() & 0o777,
            0o600
        );
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(!adapter.owner_only().unwrap());
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700)).unwrap();
        std::fs::set_permissions(&paths[0], std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(!adapter.owner_only().unwrap());
        assert_eq!(
            adapter.get("key", false).unwrap_err().code,
            ErrorCode::InvalidData
        );
    }
}

#[test]
fn persists_long_names_and_fixed_failures() {
    use envden_core::adapters::IKeychainAdapter;
    let home = tempfile::tempdir().unwrap();
    let name = "k".repeat(200);
    let adapter = envden_adapter_keychain_file::create_file_keychain_adapter(home.path());
    adapter.set(&name, &[7]).unwrap();
    assert_eq!(adapter.get(&name, false).unwrap(), Some(vec![7]));
    assert_eq!(
        envden_adapter_keychain_file::create_file_keychain_adapter(home.path())
            .get(&name, false)
            .unwrap(),
        Some(vec![7])
    );
    let blocked = tempfile::tempdir().unwrap();
    std::fs::write(blocked.path().join("state"), "private contents").unwrap();
    let error = envden_adapter_keychain_file::create_file_keychain_adapter(blocked.path())
        .set("key", &[1])
        .unwrap_err();
    assert_eq!(error.message, "Key storage operation failed");
    assert!(error.source.is_some());
}

#[test]
#[cfg(unix)]
fn owner_only_reads_all_metadata_before_deciding() {
    use envden_core::adapters::IKeychainAdapter;
    use std::os::unix::fs::{PermissionsExt, symlink};
    let home = tempfile::tempdir().unwrap();
    let directory = home.path().join("state/keys");
    std::fs::create_dir_all(&directory).unwrap();
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o755)).unwrap();
    symlink(directory.join("absent"), directory.join("dangling")).unwrap();
    let adapter = envden_adapter_keychain_file::create_file_keychain_adapter(home.path());
    assert!(adapter.owner_only().is_err());
}

#[test]
#[cfg(windows)]
fn owner_only_does_not_inspect_windows_paths() {
    use envden_core::adapters::IKeychainAdapter;
    let home = tempfile::tempdir().unwrap();
    std::fs::write(home.path().join("state"), "not a directory").unwrap();
    let adapter = envden_adapter_keychain_file::create_file_keychain_adapter(home.path());
    assert!(adapter.owner_only().unwrap());
}
