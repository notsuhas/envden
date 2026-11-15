use super::link_file;
use crate::{adapters::create_adapters, state::empty_state, store::store_path};
use envden_core::adapters::{ICheckout, TPlacementMode};
use std::{fs, os::unix::fs::symlink};

#[test]
fn keeps_checkout_link_when_the_store_link_is_dangling() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("checkout");
    fs::create_dir(&root).unwrap();
    let adapters = create_adapters(Some(temp.path().join("home")), temp.path().into(), || 42);
    let checkout = ICheckout {
        root: root.to_string_lossy().into_owned(),
        repo_id: "host/repo".into(),
        ..Default::default()
    };
    let store = store_path(&adapters.home, &checkout.repo_id, ".env").unwrap();
    fs::create_dir_all(store.parent().unwrap()).unwrap();
    symlink(temp.path().join("missing"), &store).unwrap();
    symlink(&store, root.join(".env")).unwrap();
    let placement = adapters.placement(TPlacementMode::Link, &root);
    let mut state = empty_state("test");
    assert!(
        link_file(&adapters, &mut state, &checkout, placement.as_ref(), ".env")
            .unwrap()
            .is_none()
    );
    assert!(
        fs::symlink_metadata(root.join(".env"))
            .unwrap()
            .is_symlink()
    );
    assert_eq!(state["links"].as_array().unwrap().len(), 1);
}
