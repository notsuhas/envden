use super::*;

#[test]
fn missing_store_leaves_regular_copy_detached_in_link_mode() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let store = temp.path().join("store");
    fs::write(&store, "A=secret\n").unwrap();
    let dest = root.join(".env");
    fs::write(&dest, "RESTORED=yes\n").unwrap();
    fs::remove_file(&store).unwrap();
    let adapter =
        create_fs_placement_adapter(TPlacementMode::Link, &root, None, || 1800000000000.0);
    assert_eq!(
        adapter
            .inspect(store.to_str().unwrap(), dest.to_str().unwrap())
            .unwrap(),
        TPlacementState::Detached
    );
}

#[test]
#[cfg(unix)]
fn removal_rejects_dangling_checkout_root() {
    use envden_core::{adapters::IPlacementAdapter, adapters::TPlacementMode};
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("root");
    std::os::unix::fs::symlink(temp.path().join("missing"), &root).unwrap();
    let adapter = envden_adapter_placement_fs::create_fs_placement_adapter(
        TPlacementMode::Link,
        &root,
        None,
        || 0.0,
    );
    assert!(
        adapter
            .remove(None, root.join(".env").to_str().unwrap())
            .is_err()
    );
}

#[test]
fn inspect_propagates_store_stat_errors() {
    use envden_core::{adapters::IPlacementAdapter, adapters::TPlacementMode};
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let dest = root.join(".env");
    std::fs::write(&dest, "value").unwrap();
    let store = root.join("invalid\0store");
    let cause = store.symlink_metadata().unwrap_err();
    assert_ne!(cause.kind(), std::io::ErrorKind::NotFound);
    let adapter = envden_adapter_placement_fs::create_fs_placement_adapter(
        TPlacementMode::Copy,
        root,
        None,
        || 0.0,
    );
    let error = adapter
        .inspect(store.to_str().unwrap(), dest.to_str().unwrap())
        .unwrap_err();
    assert!(std::error::Error::source(&error).is_some());
}
