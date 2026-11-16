use super::super::context::repair_context;
use super::fixture::fixture;

#[test]
fn repair_context_only_decodes_local_entries() {
    let (_dir, adapters, server, token) = fixture();
    let mut state = crate::state::repository::load_state(&adapters.home)
        .unwrap()
        .unwrap();
    state["headers"] = serde_json::json!(["!"]);
    crate::state::repository::save_state(&adapters.home, &state, &adapters.now).unwrap();
    assert!(repair_context(&adapters, &token, server.clone()).is_ok());
    assert!(server.requests.borrow().is_empty());
}

#[test]
fn stored_entries_decode_before_stored_headers() {
    let (_dir, adapters, server, token) = fixture();
    let (context, _) = repair_context(&adapters, &token, server.clone()).unwrap();
    let local = crate::vault::history::ILocalHistory {
        entries: vec![String::new()],
        headers: vec!["!".into()],
        ..Default::default()
    };
    let error =
        crate::vault::history::read_history(&context.client, &context.vault_id, Some(&local))
            .err()
            .unwrap();
    assert_eq!(error.message, "Truncated data");
    assert!(server.requests.borrow().is_empty());
}
