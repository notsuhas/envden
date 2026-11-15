use super::{
    fixture,
    support::{entry, opts, repo},
};
use crate::{
    links::approval::checkout_value,
    sync::{
        local::{conflicts::IConflictTarget, reconciliation::file::reconcile_file_with_choice},
        remote::context::sync_context,
    },
};
use serde_json::json;
use std::{cell::Cell, collections::HashSet, fs, rc::Rc};

#[test]
fn initial_reconciliation_offers_a_choice_for_a_differing_regular_copy() {
    let (_dir, a, server, _) = fixture::fixture();
    let root = repo(&a);
    let mut context = sync_context(&a, opts(&a), server).unwrap();
    let checkout = a.repo.checkout_at(root.to_str().unwrap()).unwrap().unwrap();
    context.state["approved"] = json!([checkout_value(&checkout)]);
    let store = crate::store::store_path(&a.home, "github.com/test/review", ".env").unwrap();
    fs::create_dir_all(store.parent().unwrap()).unwrap();
    fs::write(&store, b"TOKEN=one\n").unwrap();
    fs::write(root.join(".env"), b"TOKEN=two\n").unwrap();
    let entry = entry(&context, ".env", 1, b"TOKEN=one\n");
    let target = IConflictTarget {
        root: root.to_string_lossy().into_owned(),
        path: ".env".into(),
        store: store.to_string_lossy().into_owned(),
        mode: "copy".into(),
        local_only: None,
    };
    let calls = Rc::new(Cell::new(0));
    let recorded = calls.clone();
    let choose = Rc::new(move |_: &str| {
        recorded.set(recorded.get() + 1);
        Ok("keep-mine".into())
    });
    let result = reconcile_file_with_choice(
        &mut context,
        &[target],
        store.to_str().unwrap(),
        Some(&entry),
        &HashSet::new(),
        Some(choose),
    )
    .unwrap();
    assert_eq!(calls.get(), 1);
    assert_eq!(result.1, 0);
    assert_eq!(fs::read(&store).unwrap(), b"TOKEN=two\n");
}
