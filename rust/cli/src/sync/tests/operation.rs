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
    let (_dir, mut a, server, _) = fixture::fixture();
    let root = repo(&a);
    let checkout = a.repo.checkout_at(root.to_str().unwrap()).unwrap().unwrap();
    let approved = checkout_value(&checkout);
    a.repo = Box::new(envden_testing::repo::IFakeRepoAdapter {
        checkout_at: Some(Box::new(move |_| Ok(Some(checkout.clone())))),
        ensure_ignored: Some(Box::new(|_, _| {
            Err(envden_core::errors::EnvdenError::new(
                envden_core::errors::ErrorCode::Internal,
                "Injected exclusion failure",
            ))
        })),
        ..Default::default()
    });
    let mut c = sync_context(&a, opts(&a), server).unwrap();
    c.state["approved"] = json!([approved]);
    let store = a.home.join("store/file");
    fs::create_dir_all(store.parent().unwrap()).unwrap();
    fs::write(&store, b"TOKEN=one\n").unwrap();
    let target = IConflictTarget {
        root: root.to_string_lossy().into_owned(),
        path: ".env".into(),
        store: store.to_string_lossy().into_owned(),
        mode: "link".into(),
        local_only: None,
    };
    let error = commit_file(
        &mut c,
        &[target],
        store.to_str().unwrap(),
        Some(b"TOKEN=one\n"),
        Some(b"TOKEN=one\n"),
        None,
    )
    .unwrap_err();
    assert_eq!(error.message, "Injected exclusion failure");
    let pending = suffix(
        &base_path(&a.home, store.to_str().unwrap(), None),
        ".pending",
    );
    let operation: serde_json::Value = serde_json::from_slice(&fs::read(pending).unwrap()).unwrap();
    assert_eq!(operation["written"], json!([true, false]));
}
