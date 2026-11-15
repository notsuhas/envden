use super::{fixture, support::opts};
use crate::sync::{
    local::files::base_path,
    remote::{attempt::record::acknowledge, context::sync_context},
};
use serde_json::json;
use std::fs;

#[test]
fn attempts_directory_read_errors_are_ignored_like_typescript() {
    let (_dir, a, server, _) = fixture::fixture();
    let c = sync_context(&a, opts(&a), server).unwrap();
    fs::write(a.home.join("state/attempts"), b"not a directory").unwrap();
    acknowledge(&c).unwrap();
}

#[test]
fn only_one_invalid_suffix_is_stripped_from_attempt_names() {
    let (_dir, a, server, _) = fixture::fixture();
    let mut c = sync_context(&a, opts(&a), server).unwrap();
    let store = a.home.join("store/file");
    c.state["links"] = json!([{"store":store}]);
    fs::create_dir_all(a.home.join("state/attempts")).unwrap();
    fs::write(
        a.home
            .join("state/attempts")
            .join(format!("{}.invalid.invalid", "A".repeat(43))),
        b"marker",
    )
    .unwrap();
    acknowledge(&c).unwrap();
    assert!(
        !crate::sync::local::reconciliation::operation::deletion::suffix(
            &base_path(&a.home, store.to_str().unwrap(), None),
            ".corrupt"
        )
        .exists()
    );
}
