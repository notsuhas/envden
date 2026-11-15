use envden_adapter_keychain_file::create_file_keychain_adapter;
use envden_core::adapters::IKeychainAdapter;

#[test]
fn owner_only_keys_survive_new_adapter() {
    let home = tempfile::tempdir().unwrap();
    let adapter = create_file_keychain_adapter(home.path());
    assert!(adapter.owner_only().unwrap());
    adapter.set("../name", &[0, 255, 128]).unwrap();
    assert_eq!(
        create_file_keychain_adapter(home.path())
            .get("../name", false)
            .unwrap(),
        Some(vec![0, 255, 128])
    );
    #[cfg(unix)]
    {
        use std::{fs, os::unix::fs::PermissionsExt};
        let directory = home.path().join("state/keys");
        assert_eq!(
            fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
            0o700
        );
        for entry in fs::read_dir(directory).unwrap() {
            assert_eq!(
                fs::metadata(entry.unwrap().path())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
    }
}

#[cfg(windows)]
#[test]
fn keys_drop_inherited_acl_entries() {
    let home = tempfile::tempdir().unwrap();
    create_file_keychain_adapter(home.path())
        .set("key", &[1])
        .unwrap();
    for entry in std::fs::read_dir(home.path().join("state/keys")).unwrap() {
        let output = envden_core::process::exec_trusted_sync(
            "icacls",
            &[entry.unwrap().path().to_string_lossy().into_owned()],
            &Default::default(),
        )
        .unwrap();
        assert!(!output.contains("(I)"));
    }
}
