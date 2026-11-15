use envden_core::filesystem::{file_identity, path_identity};
use std::{fs, fs::File};

#[test]
fn file_and_path_identity_match_and_count_hard_links() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("identity");
    fs::write(&path, b"bytes").unwrap();
    let opened = file_identity(&File::open(&path).unwrap()).unwrap();
    assert_eq!(opened, path_identity(&path).unwrap());
    assert_eq!(opened.size, 5);
    assert_eq!(opened.links, 1);
    let link = root.path().join("hardlink");
    fs::hard_link(&path, &link).unwrap();
    let original = path_identity(&path).unwrap();
    let linked = path_identity(&link).unwrap();
    assert_eq!(original.device, linked.device);
    assert_eq!(original.inode, linked.inode);
    assert_eq!(original.links, 2);
}
