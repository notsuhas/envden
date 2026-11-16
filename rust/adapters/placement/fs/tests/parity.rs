use envden_adapter_placement_fs::{create_fs_placement_adapter, prune_backups};
use envden_core::adapters::*;
use std::fs;

#[test]
fn retention_uses_names_instead_of_file_timestamps() {
    let temp = tempfile::tempdir().unwrap();
    let backups = temp.path().join("conflicts");
    fs::create_dir(&backups).unwrap();
    let old = ".envden-backup-0-11111111-1111-1111-1111-111111111111";
    let recent = ".envden-backup-4000000000-22222222-2222-2222-2222-222222222222";
    for name in [old, recent, "keep"] {
        fs::write(backups.join(name), "keep").unwrap();
    }
    for (name, seconds) in [(old, 4000000), (recent, 0)] {
        fs::File::options()
            .write(true)
            .open(backups.join(name))
            .unwrap()
            .set_times(
                fs::FileTimes::new()
                    .set_accessed(std::time::UNIX_EPOCH + std::time::Duration::from_secs(seconds))
                    .set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(seconds)),
            )
            .unwrap();
    }
    #[cfg(unix)]
    {
        let alias = backups.join(".envden-backup-0-33333333-3333-3333-3333-333333333333");
        std::os::unix::fs::symlink(backups.join(old), &alias).unwrap();
        prune_backups(&backups, 4000000000.0, None).unwrap();
        assert!(alias.is_symlink());
        fs::remove_file(alias).unwrap();
    }
    prune_backups(&backups, 4000000000.0, None).unwrap();
    let mut names: Vec<_> = fs::read_dir(&backups)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    assert_eq!(names, [recent, "keep"]);
    prune_backups(&temp.path().join("missing"), 4000000000.0, None).unwrap();
}

#[test]
fn differing_bytes_require_backup_and_equal_bytes_use_injected_clock() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let store = temp.path().join("store");
    let dest = root.join(".env");
    fs::write(&store, "A=secret\n").unwrap();
    fs::write(&dest, "keep").unwrap();
    for backups in [
        None,
        Some(root.join("conflicts")),
        Some(root.join("..conflicts")),
    ] {
        let adapter =
            create_fs_placement_adapter(TPlacementMode::Copy, &root, backups.as_deref(), || {
                1800000000000.0
            });
        assert!(
            adapter
                .place(
                    store.to_str().unwrap(),
                    dest.to_str().unwrap(),
                    Some(&|_| Ok(())),
                    None
                )
                .is_err()
        );
    }
    assert_eq!(fs::read(&dest).unwrap(), b"keep");
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    fs::write(&dest, "old").unwrap();
    let backups = temp.path().join("conflicts");
    create_fs_placement_adapter(TPlacementMode::Copy, &root, Some(&backups), || {
        1800000000000.0
    })
    .place(
        store.to_str().unwrap(),
        dest.to_str().unwrap(),
        Some(&|_| Ok(())),
        None,
    )
    .unwrap();
    let names: Vec<_> = fs::read_dir(&backups)
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(names.len(), 1);
    assert!(
        names[0]
            .to_str()
            .unwrap()
            .starts_with(".envden-backup-1800000000000-")
    );
    prune_backups(&backups, 1800000000000.0, None).unwrap();
    assert_eq!(
        fs::read_dir(&backups)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect::<Vec<_>>(),
        names
    );
}

#[cfg(unix)]
#[test]
fn linked_home_targets_and_exact_replacement_text() {
    use std::os::unix::fs::symlink;
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let store = temp.path().join("store");
    let dest = root.join(".env");
    fs::write(&store, "A=secret\n").unwrap();
    symlink(temp.path(), temp.path().join("home-link")).unwrap();
    symlink(temp.path().join("home-link/store"), &dest).unwrap();
    let adapter =
        create_fs_placement_adapter(TPlacementMode::Link, &root, None, || 1800000000000.0);
    assert_eq!(
        adapter
            .inspect(store.to_str().unwrap(), dest.to_str().unwrap())
            .unwrap(),
        TPlacementState::Linked
    );
    adapter
        .place(store.to_str().unwrap(), dest.to_str().unwrap(), None, None)
        .unwrap();
    assert_eq!(fs::read(&dest).unwrap(), b"A=secret\n");
    let old = root.join(".env.old");
    symlink(temp.path().join("home-link/store"), &old).unwrap();
    adapter
        .remove(Some(store.to_str().unwrap()), old.to_str().unwrap())
        .unwrap();
    assert!(fs::symlink_metadata(old).is_err());
    fs::remove_file(&dest).unwrap();
    let original = temp.path().join("original");
    fs::write(&original, "KEEP=1\n").unwrap();
    symlink(&original, &dest).unwrap();
    assert!(
        adapter
            .place(
                store.to_str().unwrap(),
                dest.to_str().unwrap(),
                None,
                Some(temp.path().join("other").to_str().unwrap())
            )
            .unwrap_err()
            .message
            .contains("unrelated")
    );
    adapter
        .place(
            store.to_str().unwrap(),
            dest.to_str().unwrap(),
            None,
            Some(original.to_str().unwrap()),
        )
        .unwrap();
    assert!(dest.is_symlink());
    assert_eq!(fs::read(&dest).unwrap(), fs::read(&store).unwrap());
    assert_eq!(fs::read(original).unwrap(), b"KEEP=1\n");
}

#[path = "parity/paths.rs"]
mod paths;
