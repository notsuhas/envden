use super::{
    fixture,
    support::{entry, opts, repo},
};
use crate::sync::{
    local::{
        conflicts::IConflictTarget,
        reconciliation::{ancestry::ancestry, operation::deletion::request_deletion},
    },
    remote::context::sync_context,
};
use std::fs;

#[test]
fn restored_removal_targets_do_not_silently_skip_unsafe_symlinks() {
    let (_dir, a, server, _) = fixture::fixture();
    let root = repo(&a);
    let context = sync_context(&a, opts(&a), server).unwrap();
    let store = a.home.join("store/file");
    let entry = entry(&context, ".env", 1, b"TOKEN=one\n");
    let encoded = crate::client::text(&envden_protocol::protocol::encode(&entry).unwrap());
    let destination = root.join(".env");
    fs::write(root.join("external"), b"TOKEN=restored\n").unwrap();
    std::os::unix::fs::symlink(root.join("external"), &destination).unwrap();
    request_deletion(
        &a.home,
        store.to_str().unwrap(),
        true,
        Some(&encoded),
        Some(vec![destination.to_string_lossy().into_owned()]),
        (a.now)(),
    )
    .unwrap();
    let target = IConflictTarget {
        root: root.to_string_lossy().into_owned(),
        path: ".env".into(),
        store: store.to_string_lossy().into_owned(),
        mode: "link".into(),
        local_only: None,
    };
    let result = ancestry(&context, store.to_str().unwrap(), &[target], Some(&entry));
    assert!(
        matches!(result, Err(error) if error.code == envden_core::errors::ErrorCode::InvalidData)
    );
}
