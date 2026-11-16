use super::*;

#[test]
fn recovery_checks_local_vault_before_decoding_the_kit_vault() {
    let dir = tempfile::tempdir().unwrap();
    let adapters =
        crate::adapters::create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
    let mut state = crate::state::empty_state("test");
    state["vaultId"] = json!(p::base32(&[1; 32]));
    crate::state::repository::save_state(&adapters.home, &state, &|| 42).unwrap();
    assert_eq!(
        recovery(
            &adapters,
            "http://server.test",
            "test",
            "invalid",
            "invalid",
            "password"
        )
        .unwrap_err()
        .code,
        ErrorCode::Conflict
    );
}
