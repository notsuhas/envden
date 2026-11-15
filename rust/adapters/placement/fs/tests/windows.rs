#![cfg(windows)]
use envden_adapter_placement_fs::{create_fs_placement_adapter, prune_backups};
use envden_core::adapters::*;
use std::{fs, path::Path};

#[test]
fn copy_takes_over_backs_up_and_handles_case_variants() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("Checkout");
    let backups = temp.path().join("backups");
    fs::create_dir(&root).unwrap();
    let store = temp.path().join("store");
    fs::write(&store, b"NEW\xff").unwrap();
    let dest = root.join(".env");
    fs::write(&dest, b"OLD\xff").unwrap();
    let adapter =
        create_fs_placement_adapter(TPlacementMode::Copy, &root, Some(&backups), || 123.0);
    adapter
        .place(
            store.to_str().unwrap(),
            dest.to_str().unwrap(),
            Some(&|_| Ok(())),
            None,
        )
        .unwrap();
    assert_eq!(fs::read(&dest).unwrap(), b"NEW\xff");
    let entries: Vec<_> = fs::read_dir(&backups)
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    assert_eq!(entries.len(), 1);
    assert_eq!(fs::read(&entries[0]).unwrap(), b"OLD\xff");
    let alternate = Path::new(&root.to_string_lossy().to_lowercase()).join(".env");
    assert_eq!(
        adapter
            .inspect(store.to_str().unwrap(), alternate.to_str().unwrap())
            .unwrap(),
        TPlacementState::Linked
    );
    prune_backups(&backups, 124.0, Some(0.0)).unwrap();
    assert!(!entries[0].exists());
}

#[test]
fn copy_drops_inherited_acl_entries() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let store = temp.path().join("store");
    let destination = root.join(".env");
    fs::write(&store, "A=secret\n").unwrap();
    create_fs_placement_adapter(TPlacementMode::Copy, &root, None, || 1800000000000.0)
        .place(
            store.to_str().unwrap(),
            destination.to_str().unwrap(),
            Some(&|_| Ok(())),
            None,
        )
        .unwrap();
    for file in [&store, &destination] {
        let acl = envden_core::process::exec_trusted_sync(
            "icacls",
            &[file.to_string_lossy().into_owned()],
            &Default::default(),
        )
        .unwrap();
        assert!(!acl.contains("(I)"));
    }
}
