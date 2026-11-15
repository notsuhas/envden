use envden_adapter_placement_fs::create_fs_placement_adapter;
use envden_core::adapters::*;
use std::path::Path;
#[test]
fn link_contract() {
    envden_testing::placement::placement_contract(|root, backup| {
        Box::new(create_fs_placement_adapter(
            TPlacementMode::Link,
            root,
            backup.map(Path::new),
            || 123.0,
        ))
    });
}
#[test]
fn copy_contract() {
    envden_testing::placement::placement_contract(|root, backup| {
        Box::new(create_fs_placement_adapter(
            TPlacementMode::Copy,
            root,
            backup.map(Path::new),
            || 123.0,
        ))
    });
}
#[test]
fn temporary_exclude_and_permissions() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("checkout");
    std::fs::create_dir(&root).unwrap();
    let store = dir.path().join("store");
    std::fs::write(&store, "A=secret\n").unwrap();
    let dest = root.join("nested/.env");
    let adapter = create_fs_placement_adapter(TPlacementMode::Copy, &root, None, || 123.0);
    let prepared = std::sync::Mutex::new(String::new());
    adapter
        .place(
            store.to_str().unwrap(),
            dest.to_str().unwrap(),
            Some(&|s| {
                *prepared.lock().unwrap() = s.into();
                Ok(())
            }),
            None,
        )
        .unwrap();
    assert!(prepared.lock().unwrap().starts_with("nested/.envden-"));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(root.join("nested"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        for p in [&store, &dest] {
            assert_eq!(
                std::fs::metadata(p).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
}
