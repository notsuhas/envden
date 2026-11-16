use crate::{
    adapters::create_adapters,
    links::approval::checkout_value,
    state::{empty_state, repository::save_state},
    sync::{local::files::base_path, remove::remove_file},
};
use envden_core::filesystem::ICanonicalPath;
use serde_json::json;
use std::{fs, process::Command};
#[test]
fn removal_cleans_shared_bases() {
    let temp = tempfile::tempdir().unwrap();
    let dir = temp.path();
    let root = dir.join("repo");
    let home = dir.join("home");
    let store = home.join("store/file");
    fs::create_dir_all(&root).unwrap();
    assert!(
        Command::new("git")
            .args(["init", "-q"])
            .arg(&root)
            .status()
            .unwrap()
            .success()
    );
    assert!(
        Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(["remote", "add", "origin", "https://github.com/test/review"])
            .status()
            .unwrap()
            .success()
    );
    let root = root.canonical_path().unwrap();
    let a = create_adapters(Some(home.clone()), dir.into(), || 1800000000000);
    let checkout = a.repo.checkout_at(root.to_str().unwrap()).unwrap().unwrap();
    let mut s = empty_state("test");
    s["approved"] = json!([checkout_value(&checkout)]);
    s["links"] = json!([{"root":root,"path":".env","store":store,"mode":"copy"}]);
    save_state(&home, &s, &a.now).unwrap();
    fs::create_dir_all(home.join("store")).unwrap();
    fs::create_dir_all(home.join("base")).unwrap();
    for p in [
        store.clone(),
        root.join(".env"),
        base_path(&home, store.to_str().unwrap(), None),
        base_path(&home, store.to_str().unwrap(), root.to_str()),
    ] {
        fs::write(p, b"A=1\n").unwrap();
    }
    remove_file(&a, &root.join(".env"), true, false, &|_| {}).unwrap();
    assert!(!base_path(&home, store.to_str().unwrap(), None).exists());
}
