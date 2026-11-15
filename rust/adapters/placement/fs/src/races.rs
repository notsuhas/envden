use crate::{adapter::create_fs_placement_adapter, native};
use envden_core::adapters::TPlacementMode;
use rustix::fs::CWD;
use std::{fs, os::unix::fs::symlink};

#[test]
fn rename_and_backup_stay_on_opened_directory_after_swap() {
    for mode in [TPlacementMode::Copy, TPlacementMode::Link] {
        for previous in [None, Some("inside")] {
            let temp = tempfile::tempdir().unwrap();
            let root = temp.path().join("checkout");
            let outside = temp.path().join("outside");
            let parent = root.join("nested");
            fs::create_dir_all(&parent).unwrap();
            fs::create_dir(&outside).unwrap();
            let store = temp.path().join("store");
            let backups = temp.path().join("conflicts");
            fs::write(&store, "SECRET=1\n").unwrap();
            if let Some(bytes) = previous {
                fs::write(parent.join(".env"), bytes).unwrap();
                fs::write(outside.join(".env"), "outside").unwrap();
            }
            let adapter =
                create_fs_placement_adapter(mode, &root, Some(&backups), || 1800000000000.0);
            adapter
                .place_with_hook(
                    store.to_str().unwrap(),
                    parent.join(".env").to_str().unwrap(),
                    Some(&|_| Ok(())),
                    None,
                    || {
                        fs::rename(&parent, root.join("moved")).unwrap();
                        symlink(&outside, &parent).unwrap();
                    },
                )
                .unwrap();
            assert_eq!(fs::read(root.join("moved/.env")).unwrap(), b"SECRET=1\n");
            if previous.is_some() {
                let names: Vec<_> = fs::read_dir(&backups)
                    .unwrap()
                    .map(|e| e.unwrap().path())
                    .collect();
                assert_eq!(names.len(), 1);
                assert_eq!(fs::read(&names[0]).unwrap(), b"inside");
                assert_eq!(fs::read(outside.join(".env")).unwrap(), b"outside");
            } else {
                assert_eq!(fs::read_dir(outside).unwrap().count(), 0);
            }
        }
    }
}

#[test]
fn unlink_stays_anchored_after_parent_swap() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    let parent = root.join("nested");
    let outside = temp.path().join("outside");
    fs::create_dir_all(&parent).unwrap();
    fs::create_dir(&outside).unwrap();
    fs::write(parent.join(".env"), "inside").unwrap();
    fs::write(outside.join(".env"), "outside").unwrap();
    let adapter = create_fs_placement_adapter(TPlacementMode::Copy, &root, None, || 0.0);
    adapter
        .remove_with_hook(None, parent.join(".env").to_str().unwrap(), || {
            fs::rename(&parent, root.join("moved")).unwrap();
            symlink(&outside, &parent).unwrap();
        })
        .unwrap();
    assert_eq!(fs::read_dir(root.join("moved")).unwrap().count(), 0);
    assert_eq!(fs::read(outside.join(".env")).unwrap(), b"outside");
}

#[test]
fn exclusive_writes_and_nofollow_identity() {
    let temp = tempfile::tempdir().unwrap();
    let checkout = temp.path().join("checkout");
    let outside = temp.path().join("outside");
    fs::create_dir(&checkout).unwrap();
    fs::create_dir(&outside).unwrap();
    let fd = native::parent(&checkout, std::path::Path::new("nested/.env"), true).unwrap();
    assert!(native::identity(&fd, ".env").unwrap().is_none());
    native::write(&fd, ".env", b"keep").unwrap();
    let before = native::identity(&fd, ".env").unwrap();
    assert!(before.is_some());
    assert!(native::write(&fd, ".env", b"replace").is_err());
    assert!(native::same(
        &before,
        &native::identity(&fd, ".env").unwrap()
    ));
    symlink(&outside, checkout.join("link")).unwrap();
    assert!(native::parent(&checkout, std::path::Path::new("link/.env"), true).is_err());
    symlink(".env", checkout.join("nested/alias")).unwrap();
    assert!(!native::same(
        &before,
        &native::identity(&fd, "alias").unwrap()
    ));
    fs::rename(checkout.join("nested"), checkout.join("moved")).unwrap();
    symlink(&outside, checkout.join("nested")).unwrap();
    native::write(&fd, "after-swap", b"safe").unwrap();
    assert_eq!(fs::read_dir(outside).unwrap().count(), 0);
    assert_eq!(
        native::read(CWD, checkout.join("moved/after-swap"), false).unwrap(),
        b"safe"
    );
}
