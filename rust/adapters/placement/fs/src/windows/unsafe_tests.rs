use super::state;
use crate::create_fs_placement_adapter;
use envden_core::{adapters::*, errors::ErrorCode};
use std::{
    fs,
    os::windows::fs::{symlink_dir, symlink_file},
    path::Path,
};

#[test]
fn fallback_refuses_unsafe_roots_parents_sources_and_destinations() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let store = temp.path().join("store");
    fs::write(&store, "A=secret\n").unwrap();
    let dest = root.join(".env");
    let alias = temp.path().join("alias");
    symlink_dir(&root, &alias).unwrap();
    for unsafe_root in [&alias, &store] {
        for relative in [".env", "nested/.env"] {
            for create in [true, false] {
                let error = state::parents(unsafe_root, Path::new(relative), create).unwrap_err();
                assert_eq!(
                    error.code,
                    if create {
                        ErrorCode::InvalidInput
                    } else {
                        ErrorCode::Conflict
                    }
                );
                assert_eq!(
                    error.message,
                    if create {
                        "Unsafe checkout root"
                    } else {
                        "Unsafe checkout parent"
                    }
                );
            }
            let adapter =
                create_fs_placement_adapter(TPlacementMode::Copy, unsafe_root, None, || {
                    1800000000000.0
                });
            let error = adapter
                .inspect(
                    store.to_str().unwrap(),
                    unsafe_root.join(relative).to_str().unwrap(),
                )
                .unwrap_err();
            assert_eq!(error.code, ErrorCode::InvalidInput);
            assert_eq!(error.message, "Unsafe checkout root");
        }
    }
    let adapter =
        create_fs_placement_adapter(TPlacementMode::Copy, &root, None, || 1800000000000.0);
    let place = |source: &Path, dest: &Path| {
        adapter.place(
            source.to_str().unwrap(),
            dest.to_str().unwrap(),
            Some(&|_| Ok(())),
            None,
        )
    };
    for parent in [&store, temp.path()] {
        let link = root.join("unsafe");
        if parent.is_file() {
            symlink_file(parent, &link).unwrap();
        } else {
            symlink_dir(parent, &link).unwrap();
        }
        assert!(
            place(&store, &link.join(".env"))
                .unwrap_err()
                .message
                .contains("Unsafe checkout parent")
        );
        assert!(
            adapter
                .remove(
                    Some(store.to_str().unwrap()),
                    link.join(".env").to_str().unwrap()
                )
                .is_err()
        );
        if parent.is_file() {
            fs::remove_file(link).unwrap();
        } else {
            fs::remove_dir(link).unwrap();
        }
    }
    fs::create_dir(&dest).unwrap();
    assert!(
        place(&store, &dest)
            .unwrap_err()
            .message
            .contains("Destination is not a file")
    );
    assert!(
        adapter
            .remove(Some(store.to_str().unwrap()), dest.to_str().unwrap())
            .unwrap_err()
            .message
            .contains("Destination is not a file")
    );
    fs::remove_dir(&dest).unwrap();
    symlink_file(&store, &dest).unwrap();
    assert!(
        adapter
            .remove(None, dest.to_str().unwrap())
            .unwrap_err()
            .message
            .contains("unrelated")
    );
    assert!(
        place(&alias, &dest)
            .unwrap_err()
            .message
            .contains("unrelated")
    );
    fs::remove_file(&dest).unwrap();
    for source in [&alias, &root] {
        assert!(
            place(source, &dest)
                .unwrap_err()
                .message
                .contains("Store source")
        );
    }
    fs::write(&dest, "keep").unwrap();
    assert!(
        place(&store, &dest)
            .unwrap_err()
            .message
            .contains("Backup directory")
    );
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    assert_eq!(fs::read(dest).unwrap(), b"keep");
}

#[test]
fn fallback_recognizes_store_through_linked_home() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let store = temp.path().join("store");
    fs::write(&store, "A=secret\n").unwrap();
    symlink_dir(temp.path(), temp.path().join("home-link")).unwrap();
    let dest = root.join(".env");
    symlink_file(temp.path().join("home-link/store"), &dest).unwrap();
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
    assert_eq!(fs::read(dest).unwrap(), b"A=secret\n");
    let old = root.join(".env.old");
    symlink_file(temp.path().join("home-link/store"), &old).unwrap();
    adapter
        .remove(Some(store.to_str().unwrap()), old.to_str().unwrap())
        .unwrap();
    assert!(fs::symlink_metadata(old).is_err());
}
