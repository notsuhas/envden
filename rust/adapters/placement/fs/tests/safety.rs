use envden_adapter_placement_fs::create_fs_placement_adapter;
use envden_core::adapters::*;
use std::fs;

#[test]
fn copy_excludes_before_writing_and_replaces_only_its_leftover() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let store = temp.path().join("store");
    fs::write(&store, "A=secret\n").unwrap();
    let dest = root.join(".env");
    let adapter =
        create_fs_placement_adapter(TPlacementMode::Copy, &root, None, || 1800000000000.0);
    let place = |prepare: Option<TPrepareTemporary<'_>>| {
        adapter.place(
            store.to_str().unwrap(),
            dest.to_str().unwrap(),
            prepare,
            None,
        )
    };
    assert!(place(None).unwrap_err().message.contains("exclude"));
    let name = std::sync::Mutex::new(String::new());
    place(Some(&|path| {
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        *name.lock().unwrap() = path.into();
        Ok(())
    }))
    .unwrap();
    let name = name.into_inner().unwrap();
    fs::write(root.join(&name), "LEFTOVER=secret").unwrap();
    place(Some(&|path| {
        assert_eq!(path, name);
        Ok(())
    }))
    .unwrap();
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    assert_eq!(fs::read(&dest).unwrap(), b"A=secret\n");
    adapter
        .place(
            store.to_str().unwrap(),
            root.join("nested/.env").to_str().unwrap(),
            Some(&|path| {
                assert_ne!(path, name);
                Ok(())
            }),
            None,
        )
        .unwrap();
}

#[test]
fn backups_are_required_private_outside_and_not_repeated_for_equal_bytes() {
    for mode in [TPlacementMode::Copy, TPlacementMode::Link] {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("checkout");
        fs::create_dir(&root).unwrap();
        let store = temp.path().join("store");
        let dest = root.join(".env");
        let backups = temp.path().join("conflicts");
        fs::write(&store, "A=secret\n").unwrap();
        fs::write(&dest, "LOCAL=keep\n").unwrap();
        for backup in [
            None,
            Some(root.join("conflicts")),
            Some(root.join("..conflicts")),
        ] {
            let adapter =
                create_fs_placement_adapter(mode, &root, backup.as_deref(), || 1800000000000.0);
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
            assert_eq!(fs::read(&dest).unwrap(), b"LOCAL=keep\n");
            assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        }
        let adapter = create_fs_placement_adapter(mode, &root, Some(&backups), || 1800000000000.0);
        for _ in 0..3 {
            adapter
                .place(
                    store.to_str().unwrap(),
                    dest.to_str().unwrap(),
                    Some(&|_| Ok(())),
                    None,
                )
                .unwrap();
        }
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
                .starts_with(".envden-backup-1800000000000-")
        );
        assert_eq!(fs::read(&entries[0]).unwrap(), b"LOCAL=keep\n");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&backups).unwrap().permissions().mode() & 0o777,
                0o700
            );
            assert_eq!(
                fs::metadata(&entries[0]).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        fs::remove_file(&dest).unwrap();
        fs::write(&dest, "A=secret\n").unwrap();
        adapter
            .place(
                store.to_str().unwrap(),
                dest.to_str().unwrap(),
                Some(&|_| Ok(())),
                None,
            )
            .unwrap();
        assert_eq!(fs::read_dir(&backups).unwrap().count(), 1);
    }
}

#[test]
fn removal_and_missing_store_inspection_preserve_unrelated_contents() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let store = temp.path().join("store");
    let dest = root.join(".env");
    let adapter = create_fs_placement_adapter(TPlacementMode::Copy, &root, None, || 1.0);
    adapter
        .remove(None, root.join("missing/.env").to_str().unwrap())
        .unwrap();
    fs::create_dir(root.join("folder")).unwrap();
    assert!(
        adapter
            .remove(None, root.join("folder").to_str().unwrap())
            .is_err()
    );
    fs::write(&dest, "RESTORED=yes\n").unwrap();
    assert_eq!(
        adapter
            .inspect(store.to_str().unwrap(), dest.to_str().unwrap())
            .unwrap(),
        TPlacementState::Detached
    );
    adapter.remove(None, dest.to_str().unwrap()).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::symlink;
        fs::write(&store, "A=secret\n").unwrap();
        symlink(&store, &dest).unwrap();
        assert!(adapter.remove(None, dest.to_str().unwrap()).is_err());
        assert_eq!(fs::read(&store).unwrap(), b"A=secret\n");
        symlink(temp.path(), root.join("escape")).unwrap();
        assert!(
            adapter
                .remove(
                    Some(store.to_str().unwrap()),
                    root.join("escape/store").to_str().unwrap()
                )
                .is_err()
        );
        adapter
            .remove(Some(store.to_str().unwrap()), dest.to_str().unwrap())
            .unwrap();
    }
}
