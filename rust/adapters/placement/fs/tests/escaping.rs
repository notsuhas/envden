#![cfg(unix)]
use envden_adapter_placement_fs::create_fs_placement_adapter;
use envden_core::adapters::*;
use std::{fs, path::Path};

#[cfg(unix)]
#[test]
fn escaping_links_leave_targets_untouched() {
    use std::os::unix::fs::symlink;
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let store = temp.path().join("store");
    fs::write(&store, "A=secret\n").unwrap();
    let outside = temp.path().join("outside");
    fs::create_dir(&outside).unwrap();
    symlink(outside, root.join("apps")).unwrap();
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
    assert!(
        place(&store, &root.join("apps/.env"))
            .unwrap_err()
            .message
            .contains("parent")
    );
    symlink(&store, root.join(".env")).unwrap();
    let unrelated = temp.path().join("unrelated");
    fs::write(&unrelated, "keep").unwrap();
    assert!(
        place(&unrelated, &root.join(".env"))
            .unwrap_err()
            .message
            .contains("unrelated")
    );
    assert_eq!(fs::read(&store).unwrap(), b"A=secret\n");
    assert!(place(&store, &root.join("../escape")).is_err());
}
