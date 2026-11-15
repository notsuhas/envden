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
use std::{cell::RefCell, collections::HashSet, fs, rc::Rc};

#[test]
fn placement_backup_notice_uses_the_checkout_relative_path() {
    let (_dir, a, server, _) = fixture::fixture();
    let root = repo(&a);
    let mut c = sync_context(&a, opts(&a), server).unwrap();
    c.options.cwd = Some(root.clone());
    let checkout = a.repo.checkout_at(root.to_str().unwrap()).unwrap().unwrap();
    c.state["approved"] = json!([checkout_value(&checkout)]);
    let store = crate::store::store_path(&a.home, "github.com/test/review", ".env").unwrap();
    fs::create_dir_all(store.parent().unwrap()).unwrap();
    fs::write(&store, b"TOKEN=one\n").unwrap();
    fs::write(root.join(".env"), b"TOKEN=two\n").unwrap();
    let entry = entry(&c, ".env", 1, b"TOKEN=one\n");
    let target = IConflictTarget {
        root: root.to_string_lossy().into_owned(),
        path: ".env".into(),
        store: store.to_string_lossy().into_owned(),
        mode: "link".into(),
        local_only: None,
    };
    let messages = Rc::new(RefCell::new(Vec::new()));
    let recorded = messages.clone();
    c.options.report = Some(Rc::new(move |message| {
        recorded.borrow_mut().push(message.to_owned())
    }));
    reconcile_file_with_choice(
        &mut c,
        &[target],
        store.to_str().unwrap(),
        Some(&entry),
        &HashSet::new(),
        Some(Rc::new(|_| Ok("take-server".into()))),
    )
    .unwrap();
    assert!(
        messages
            .borrow()
            .iter()
            .any(|message| message.starts_with("Kept your previous .env at ")),
        "{:?}",
        messages.borrow()
    );
}
