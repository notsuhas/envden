use super::{backup::backup_with_restrict, place::place_with_verify, state};
use crate::create_fs_placement_adapter;
use envden_core::{
    adapters::*,
    errors::{EnvdenError, ErrorCode},
};
use std::{
    fs,
    os::windows::fs::{symlink_dir, symlink_file},
};

#[test]
fn fallback_modes_repeat_remove_and_replace_exact_link_text() {
    for mode in [TPlacementMode::Copy, TPlacementMode::Link] {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("checkout");
        fs::create_dir(&root).unwrap();
        let store = temp.path().join("store");
        fs::write(&store, "A=secret\n").unwrap();
        let dest = root.join("nested/.env");
        let adapter = create_fs_placement_adapter(mode, &root, None, || 1800000000000.0);
        for _ in 0..2 {
            adapter
                .place(
                    store.to_str().unwrap(),
                    dest.to_str().unwrap(),
                    Some(&|_| Ok(())),
                    None,
                )
                .unwrap();
            assert_eq!(fs::read(&dest).unwrap(), b"A=secret\n");
            assert_eq!(dest.is_symlink(), mode == TPlacementMode::Link);
        }
        for _ in 0..2 {
            adapter
                .remove(Some(store.to_str().unwrap()), dest.to_str().unwrap())
                .unwrap();
        }
        assert_eq!(fs::read_dir(dest.parent().unwrap()).unwrap().count(), 0);
        let original = temp.path().join("original");
        fs::write(&original, "KEEP=1\n").unwrap();
        symlink_file(&original, &dest).unwrap();
        assert!(
            adapter
                .place(
                    store.to_str().unwrap(),
                    dest.to_str().unwrap(),
                    Some(&|_| Ok(())),
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
                Some(&|_| Ok(())),
                Some(original.to_str().unwrap()),
            )
            .unwrap();
        assert_eq!(fs::read(&dest).unwrap(), fs::read(&store).unwrap());
        assert_eq!(fs::read(original).unwrap(), b"KEEP=1\n");
    }
}

#[test]
fn parent_snapshots_reject_replacement_directories() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    let parent = root.join("apps");
    fs::create_dir_all(&parent).unwrap();
    let snapshot = state::parents(&root, std::path::Path::new("apps/.env"), false)
        .unwrap()
        .unwrap();
    fs::rename(&parent, root.join("old")).unwrap();
    fs::create_dir(&parent).unwrap();
    assert!(
        state::verify(&snapshot, &parent.join(".env"))
            .unwrap_err()
            .message
            .contains("changed")
    );
}

#[test]
fn backup_restricts_before_writing_and_rejects_aliases() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    let backups = temp.path().join("backups");
    fs::create_dir(&root).unwrap();
    for status in [1, 0] {
        let result = backup_with_restrict(
            &root,
            Some(&backups),
            b"LOCAL=keep",
            1800000000000.0,
            |path, directory| {
                assert_eq!(path, backups);
                assert!(directory);
                if status == 1 {
                    Err(EnvdenError::new(ErrorCode::Internal, "ACL failed"))
                } else {
                    Ok(())
                }
            },
        );
        if status == 1 {
            assert!(
                result
                    .unwrap_err()
                    .message
                    .contains("restrict backup access")
            );
            assert_eq!(fs::read_dir(&backups).unwrap().count(), 0);
        } else {
            result.unwrap();
            let names: Vec<_> = fs::read_dir(&backups)
                .unwrap()
                .map(|e| e.unwrap().path())
                .collect();
            assert_eq!(names.len(), 1);
            assert_eq!(fs::read(&names[0]).unwrap(), b"LOCAL=keep");
        }
    }
    let alias = temp.path().join("backup-alias");
    symlink_dir(&backups, &alias).unwrap();
    assert!(
        backup_with_restrict(
            &root,
            Some(&alias),
            b"LOCAL=keep",
            1800000000000.0,
            |_, _| panic!("unsafe alias reached ACL restriction")
        )
        .unwrap_err()
        .message
        .contains("Unsafe backup directory")
    );
    fs::remove_dir(&alias).unwrap();
    symlink_dir(&root, &alias).unwrap();
    assert!(
        backup_with_restrict(
            &root,
            Some(&alias),
            b"LOCAL=keep",
            1800000000000.0,
            |_, _| panic!("checkout alias reached ACL restriction")
        )
        .unwrap_err()
        .message
        .contains("outside checkout")
    );
}

#[test]
fn failure_preserves_original_error_and_removes_plaintext() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let store = temp.path().join("store");
    fs::write(&store, "A=secret\n").unwrap();
    let adapter =
        create_fs_placement_adapter(TPlacementMode::Copy, &root, None, || 1800000000000.0);
    let error = place_with_verify(
        &adapter,
        store.to_str().unwrap(),
        root.join(".env").to_str().unwrap(),
        Some(&|_| Ok(())),
        None,
        |_, _| Err(EnvdenError::new(ErrorCode::Conflict, "original failure")),
    )
    .unwrap_err();
    assert_eq!(error.message, "original failure");
    assert_eq!(error.code, ErrorCode::Conflict);
    assert_eq!(fs::read_dir(root).unwrap().count(), 0);
}

mod ownership;
