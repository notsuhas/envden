use super::{
    fixture,
    support::{opts, repo},
};
use crate::{
    links::approval::checkout_value,
    sync::{
        local::{
            conflicts::IConflictTarget,
            files::base_path,
            reconciliation::operation::{deletion::suffix, resume::commit_file},
        },
        remote::context::sync_context,
    },
};
use serde_json::json;
use std::fs;

#[test]
fn missing_target_is_unwritten_even_when_the_store_already_matches() {
    let (_dir, a, server, _) = fixture::fixture();
    let root = repo(&a);
    let mut c = sync_context(&a, opts(&a), server).unwrap();
    let checkout = a.repo.checkout_at(root.to_str().unwrap()).unwrap().unwrap();
    c.state["approved"] = json!([checkout_value(&checkout)]);
    let store = a.home.join("store/file");
    fs::create_dir_all(store.parent().unwrap()).unwrap();
    fs::write(&store, b"TOKEN=one\n").unwrap();
    let exclude = root.join(".git/info/exclude");
    fs::remove_file(&exclude).unwrap();
    fs::create_dir(&exclude).unwrap();
    let target = IConflictTarget {
        root: root.to_string_lossy().into_owned(),
        path: ".env".into(),
        store: store.to_string_lossy().into_owned(),
        mode: "link".into(),
        local_only: None,
    };
    assert!(
        commit_file(
            &mut c,
            &[target],
            store.to_str().unwrap(),
            Some(b"TOKEN=one\n"),
            Some(b"TOKEN=one\n"),
            None
        )
        .is_err()
    );
    let pending = suffix(
        &base_path(&a.home, store.to_str().unwrap(), None),
        ".pending",
    );
    let operation: serde_json::Value = serde_json::from_slice(&fs::read(pending).unwrap()).unwrap();
    assert_eq!(operation["written"], json!([true, false]));
}
