use super::{
    fixture,
    support::{opts, repo},
};
use crate::{
    links::approval::checkout_value,
    sync::remote::{context::sync_context, upload::upload_changes},
};
use serde_json::json;
use std::{cell::RefCell, collections::HashSet, fs, rc::Rc};

#[test]
fn push_reports_files_held_for_approval_even_outside_selection() {
    let (_dir, a, server, _) = fixture::fixture();
    let root = repo(&a);
    let mut c = sync_context(&a, opts(&a), server).unwrap();
    let store = a.home.join("store/file");
    fs::create_dir_all(store.parent().unwrap()).unwrap();
    fs::write(&store, b"TOKEN=local\n").unwrap();
    c.state["links"] = json!([{"root":root,"path":".env","store":store,"mode":"copy"}]);
    crate::state::repository::save_state(&a.home, &c.state, (a.now)()).unwrap();
    let reports = Rc::new(RefCell::new(Vec::new()));
    let captured = reports.clone();
    c.options.report = Some(Rc::new(move |message| {
        captured.borrow_mut().push(message.to_owned())
    }));
    assert_eq!(
        upload_changes(&mut c, &HashSet::new(), &HashSet::new()).unwrap(),
        0
    );
    assert!(reports.borrow().iter().any(
        |message| message.contains("Held back") && message.contains("checkout needs approval")
    ));
}

#[test]
fn detached_upload_refuses_before_sending_content() {
    let (_dir, a, server, _) = fixture::fixture();
    let root = repo(&a);
    let mut c = sync_context(&a, opts(&a), server).unwrap();
    let checkout = a.repo.checkout_at(root.to_str().unwrap()).unwrap().unwrap();
    c.state["approved"] = json!([checkout_value(&checkout)]);
    let store = a.home.join("store/file");
    fs::create_dir_all(store.parent().unwrap()).unwrap();
    fs::write(&store, b"TOKEN=local\n").unwrap();
    fs::write(root.join(".env"), b"TOKEN=detached\n").unwrap();
    c.state["links"] = json!([{"root":root,"path":".env","store":store,"mode":"link"}]);
    let error = upload_changes(
        &mut c,
        &HashSet::from(["github.com/test/review".into()]),
        &HashSet::new(),
    )
    .unwrap_err();
    assert_eq!(error.code, envden_core::errors::ErrorCode::Conflict);
    assert_eq!(
        error.message,
        "Detached checkout; resolve local content before pushing"
    );
}
