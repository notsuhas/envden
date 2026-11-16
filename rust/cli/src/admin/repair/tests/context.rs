use super::super::context::repair_context;
use super::fixture::fixture;

#[test]
fn repair_context_only_decodes_local_entries() {
    let (_dir, adapters, server, token) = fixture();
    let mut state = crate::state::repository::load_state(&adapters.home)
        .unwrap()
        .unwrap();
    state["headers"] = serde_json::json!(["!"]);
    crate::state::repository::save_state(&adapters.home, &state, (adapters.now)()).unwrap();
    assert!(repair_context(&adapters, &token, server.clone()).is_ok());
    assert!(server.requests.borrow().is_empty());
}
