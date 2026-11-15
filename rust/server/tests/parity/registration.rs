use crate::support::{Fixture, record};
use envden_core::adapters::storage::TStateKind;
use envden_protocol::protocol::*;
use envden_server::http::encoding::binary;
use serde_json::json;

#[tokio::test]
async fn malformed_messages_are_rejected_before_crypto() {
    let f = Fixture::new();
    f.fresh();
    for path in [
        "/v1/opaque/login/start",
        "/v1/opaque/login/finish",
        "/v1/opaque/registration/start",
        "/v1/opaque/registration/finish",
    ] {
        assert_eq!(
            f.send(
                path,
                "POST",
                json!({"purpose":"unlock","message":"AA"}),
                &f.member
            )
            .await,
            (400, json!({"error":"INVALID_INPUT"})),
            "{path}"
        );
    }
}

#[tokio::test]
async fn registration_requires_freshness_and_stages_record_until_swap() {
    let f = Fixture::new();
    record(&f);
    let original = f
        .options
        .storage
        .state(&f.vault, TStateKind::OpaqueRecord, &[])
        .unwrap();
    let start = opaque_start_registration(IStartClientRegistrationParams {
        password: "new password".into(),
    })
    .unwrap();
    let body = json!({"message":start.registration_request});
    assert_eq!(
        f.send(
            "/v1/opaque/registration/start",
            "POST",
            body.clone(),
            &f.member
        )
        .await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
    f.fresh();
    let (status, response) = f
        .send("/v1/opaque/registration/start", "POST", body, &f.member)
        .await;
    assert_eq!(status, 200);
    let finish = opaque_finish_registration(IFinishClientRegistrationParams {
        password: "new password".into(),
        client_registration_state: start.client_registration_state,
        registration_response: response["message"].as_str().unwrap().into(),
        identifiers: Some(unlock_identifiers(&f.vault).identifiers),
        key_stretching_function_config: None,
    })
    .unwrap();
    let body = json!({"message":finish.registration_record});
    assert_eq!(
        f.send(
            "/v1/opaque/registration/finish",
            "POST",
            body.clone(),
            &f.member
        )
        .await,
        (200, json!({"kind":"registered"}))
    );
    assert_eq!(
        f.send("/v1/opaque/registration/finish", "POST", body, &f.member)
            .await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
    assert_eq!(
        f.options
            .storage
            .state(&f.vault, TStateKind::OpaqueRecord, &[])
            .unwrap(),
        original
    );
    let key = envden_core::adapters::storage::ISessionKey {
        kind: envden_core::adapters::storage::TSessionKind::Login,
        device: f.member.record.id.to_vec(),
        purpose: "registration-record".into(),
    };
    assert_eq!(
        f.options.storage.session(&f.vault, &key, f.now()).unwrap(),
        Some(binary(&finish.registration_record, None).unwrap())
    );
}
