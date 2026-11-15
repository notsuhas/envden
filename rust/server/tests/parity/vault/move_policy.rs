use crate::support::{VaultFixture, token_request};
use envden_core::adapters::storage::{IStateWrite, TStateKind};
use envden_protocol::protocol::*;
use serde_json::{Value, json};

#[tokio::test]
async fn discard_does_not_resurrect_consumed_setup_tokens() {
    let v = VaultFixture::new();
    let f = &v.f;
    let request = token_request(
        f,
        "/v1/move/session",
        "POST",
        &[],
        &f.member,
        TTokenKind::Setup,
        &v.setup,
    );
    assert_eq!(f.run(request).await, (200, json!({"kind":"moving"})));
    f.options
        .storage
        .write_state(
            &f.vault,
            &[IStateWrite {
                kind: TStateKind::MoveSession,
                key: b"setup".to_vec(),
                bytes: Some(v.setup.to_vec()),
            }],
        )
        .unwrap();
    let replacement = token_key(TTokenKind::Setup, &random_bytes::<20>());
    f.options.storage.set_setup_token(&replacement).unwrap();
    assert_eq!(
        f.send("/v1/move/discard", "POST", Value::Null, &f.member)
            .await,
        (200, json!({"kind":"unfrozen"}))
    );
    assert_eq!(
        f.options.storage.setup_token().unwrap(),
        Some(replacement.to_vec())
    );
    assert_ne!(replacement, v.setup);
}

#[tokio::test]
async fn stale_secret_key_refuses_export_and_freeze_but_allows_unfreeze() {
    let v = VaultFixture::new();
    let f = &v.f;
    assert_eq!(v.initialize().await.0, 200);
    let mut state = f.options.storage.vault(&f.vault).unwrap().unwrap();
    state.sk_refused = true;
    f.options
        .storage
        .configure_vault(&f.vault, &state, &[], None)
        .unwrap();
    for (path, method) in [("/v1/move/sk-pub", "GET"), ("/v1/move/freeze", "POST")] {
        assert_eq!(
            f.send(path, method, Value::Null, &f.member).await,
            (409, json!({"error":"RECOVERY_KIT_REQUIRED"}))
        );
    }
    assert!(!f.options.storage.vault(&f.vault).unwrap().unwrap().frozen);
    assert_eq!(
        f.send("/v1/move/unfreeze", "POST", Value::Null, &f.member)
            .await,
        (200, json!({"kind":"unfrozen"}))
    );
}

#[tokio::test]
async fn zero_vault_cannot_open_move_session() {
    let mut v = VaultFixture::new();
    v.f.vault = [0; 32];
    let f = &v.f;
    let request = token_request(
        f,
        "/v1/move/session",
        "POST",
        &[],
        &f.member,
        TTokenKind::Setup,
        &v.setup,
    );
    assert_eq!(
        f.run(request).await,
        (400, json!({"error":"INVALID_INPUT"}))
    );
    assert!(!f.options.storage.has_vault(&[0; 32]).unwrap());
}
