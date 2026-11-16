use envden_adapter_placement_fs::create_fs_placement_adapter;
#[cfg(unix)]
use envden_adapter_placement_fs::prune_backups;
use envden_core::adapters::*;
use std::fs;
#[cfg(unix)]
use std::path::Path;

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
    assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
    for name in ["with\u{200d}joiner", "soft\u{ad}hyphen"] {
        let local = root.join(name).join(".env");
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
        assert_eq!(
            adapter
                .inspect(store.to_str().unwrap(), local.to_str().unwrap())
                .unwrap(),
            TPlacementState::Missing
        );
    }
}

#[cfg(unix)]
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

#[test]
fn backup_filenames_use_javascript_number_formatting() {
    for (now, expected) in [
        (123.0, "123"),
        (1_800_000_000_000.0, "1800000000000"),
        (1e20, "100000000000000000000"),
        (1e21, "1e+21"),
        (-0.0, "0"),
        (1e-7, "1e-7"),
        (0.000001, "0.000001"),
    ] {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("checkout");
        fs::create_dir(&root).unwrap();
        let store = temp.path().join("store");
        let dest = root.join(".env");
        let backups = temp.path().join("backups");
        fs::write(&store, "A=remote\n").unwrap();
        fs::write(&dest, "A=local\n").unwrap();
        let adapter =
            create_fs_placement_adapter(TPlacementMode::Copy, &root, Some(&backups), move || now);
        adapter
            .place(
                store.to_str().unwrap(),
                dest.to_str().unwrap(),
                Some(&|_| Ok(())),
                None,
            )
            .unwrap();
        let entries: Vec<_> = fs::read_dir(&backups)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .collect();
        assert_eq!(entries.len(), 1);
        let name = entries[0].file_name().unwrap().to_str().unwrap();
        let suffix = name
            .strip_prefix(&format!(".envden-backup-{expected}-"))
            .unwrap_or_else(|| panic!("unexpected backup filename: {name}"));
        assert!(uuid::Uuid::parse_str(suffix).is_ok());
        assert_eq!(fs::read(&entries[0]).unwrap(), b"A=local\n");
    }
}
