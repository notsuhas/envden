use envden_adapter_placement_fs::{create_fs_placement_adapter, prune_backups};
use envden_core::adapters::*;
use std::{fs, path::Path};

#[test]
fn pulled_and_local_unicode_paths() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let store = dir.path().join("store");
    fs::write(&store, "same").unwrap();
    let adapter = create_fs_placement_adapter(TPlacementMode::Copy, &root, None, || 1.0);
    for name in [
        ".g\u{200c}it/config",
        "nested/\u{200d}.env",
        "soft\u{ad}hyphen/.env",
        ".git/config",
        ".GIT/x",
        "GIT~1/.env",
        "nested/ENV~2",
        ".env~1",
    ] {
        assert!(
            adapter
                .place(
                    store.to_str().unwrap(),
                    root.join(name).to_str().unwrap(),
                    Some(&|_| Ok(())),
                    None
                )
                .is_err()
        );
    }
    let local = root.join("with\u{200d}joiner/.env");
    fs::create_dir_all(local.parent().unwrap()).unwrap();
    fs::write(&local, "same").unwrap();
    assert_eq!(
        adapter
            .inspect(store.to_str().unwrap(), local.to_str().unwrap())
            .unwrap(),
        TPlacementState::Linked
    );
    adapter
        .remove(Some(store.to_str().unwrap()), local.to_str().unwrap())
        .unwrap();
}

#[test]
fn backups_keep_bytes_names_modes_and_prune_only_expired_files() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let store = dir.path().join("store");
    let destination = root.join(".env");
    let backups = dir.path().join("backups");
    fs::write(&store, b"NEW\xff").unwrap();
    fs::write(&destination, b"OLD\xff").unwrap();
    let adapter =
        create_fs_placement_adapter(TPlacementMode::Link, &root, Some(&backups), || 123.0);
    adapter
        .place(
            store.to_str().unwrap(),
            destination.to_str().unwrap(),
            None,
            None,
        )
        .unwrap();
    let entries: Vec<_> = fs::read_dir(&backups)
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    assert_eq!(entries.len(), 1);
    assert!(
        entries[0]
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .starts_with(".envden-backup-123-")
    );
    assert_eq!(fs::read(&entries[0]).unwrap(), b"OLD\xff");
    let link = backups.join(".envden-backup-0-00000000-0000-0000-0000-000000000000");
    std::os::unix::fs::symlink(&store, &link).unwrap();
    fs::write(backups.join("unrelated"), "KEEP").unwrap();
    prune_backups(Path::new(&backups), 124.0, Some(0.0)).unwrap();
    assert!(!entries[0].exists());
    assert!(link.is_symlink());
    assert!(backups.join("unrelated").exists());
}
