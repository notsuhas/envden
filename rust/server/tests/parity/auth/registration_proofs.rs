use crate::support::Fixture;
use envden_core::adapters::storage::{IStateWrite, IStoredVault, TStateKind};
use envden_protocol::protocol::*;
use envden_server::http::encoding::{binary, text};
use serde_json::json;

#[tokio::test]
async fn setup_proof_is_limited_to_absent_vaults_and_consumed_at_commit() {
    let f = Fixture::new();
    let key = random_bytes::<32>();
    f.options.storage.set_setup_token(&key).unwrap();
    let start = opaque_start_registration(IStartClientRegistrationParams {
        password: "password".into(),
    })
    .unwrap();
    let body = serde_json::to_vec(&json!({"message":start.registration_request})).unwrap();
    let absent = random_bytes::<32>();
    let request = |vault, proof| {
        let mut request = f.request(
            "/v1/opaque/registration/start",
            "POST",
            &body,
            &f.joiner,
            |r| r.vault_id = vault,
        );
        if proof {
            let r: IRequest = decode(
                &binary(request.headers()["envden-request"].to_str().unwrap(), None).unwrap(),
            )
            .unwrap();
            request.headers_mut().insert(
                "envden-proof",
                text(&token_proof(TTokenKind::Setup, &key, &r).unwrap())
                    .parse()
                    .unwrap(),
            );
        }
        request
    };
    assert_eq!(
        f.run(request(absent, false)).await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
    let (status, body) = f.run(request(absent, true)).await;
    assert_eq!(status, 200);
    assert_eq!(
        binary(body["message"].as_str().unwrap(), Some(64))
            .unwrap()
            .len(),
        64
    );
    assert_eq!(
        f.run(request(f.vault, true)).await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
    f.options
        .storage
        .configure_vault(
            &absent,
            &IStoredVault {
                active: true,
                unlock_period: Some(2592000000),
                ..Default::default()
            },
            &[],
            Some(&key),
        )
        .unwrap();
    assert_eq!(f.options.storage.setup_token().unwrap(), None);
    assert_eq!(
        f.run(request(random_bytes(), true)).await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
}

#[tokio::test]
async fn sk_registration_rejects_wrong_and_refused_proofs() {
    let f = Fixture::new();
    let secret = random_bytes::<16>();
    f.options
        .storage
        .write_state(
            &f.vault,
            &[IStateWrite {
                kind: TStateKind::SkPub,
                key: vec![],
                bytes: Some(sk_pub(&secret, &f.vault).to_vec()),
            }],
        )
        .unwrap();
    let start = opaque_start_registration(IStartClientRegistrationParams {
        password: "new password".into(),
    })
    .unwrap();
    let body = serde_json::to_vec(&json!({"message":start.registration_request})).unwrap();
    let request = |correct| {
        let mut request = f.request(
            "/v1/opaque/registration/start",
            "POST",
            &body,
            &f.member,
            |_| {},
        );
        let r: IRequest =
            decode(&binary(request.headers()["envden-request"].to_str().unwrap(), None).unwrap())
                .unwrap();
        request.headers_mut().insert(
            "envden-proof",
            text(&if correct {
                sign_sk_proof(&secret, &f.vault, &r).unwrap()
            } else {
                random_bytes()
            })
            .parse()
            .unwrap(),
        );
        request
    };
    assert_eq!(
        f.run(request(false)).await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
    let (status, body) = f.run(request(true)).await;
    assert_eq!(status, 200);
    assert_eq!(
        binary(body["message"].as_str().unwrap(), Some(64))
            .unwrap()
            .len(),
        64
    );
    let mut state = f.options.storage.vault(&f.vault).unwrap().unwrap();
    state.sk_refused = true;
    f.options
        .storage
        .configure_vault(&f.vault, &state, &[], None)
        .unwrap();
    assert_eq!(
        f.run(request(true)).await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
}
