use crate::{repair_changed::changed_repair, support::token_request};
use envden_core::adapters::storage::{IStoredDevice, TStateKind};
use envden_protocol::protocol::*;
use envden_server::http::encoding::{binary, text};
use serde_json::json;

#[tokio::test]
async fn repair_requires_reregistration_after_password_change() {
    let (v, close, repair) = changed_repair().await;
    let f = &v.f;
    assert_eq!(
        f.run(token_request(
            f,
            "/v1/swap",
            "POST",
            &encode(&close).unwrap(),
            &f.member,
            TTokenKind::Repair,
            &repair
        ))
        .await,
        (400, json!({"error":"INVALID_DATA"}))
    );
}

#[tokio::test]
async fn repair_rejects_envelope_named_by_older_header() {
    let (v, _, repair) = changed_repair().await;
    let f = &v.f;
    let before = f
        .options
        .storage
        .state(&f.vault, TStateKind::Envelope, &[])
        .unwrap();
    let bytes = v.create.envelope.as_ref().unwrap();
    let path = format!(
        "/v1/repair/material/envelope/{}",
        text(&h("envelope-blob", bytes))
    );
    assert_eq!(
        f.run(token_request(
            f,
            &path,
            "PUT",
            bytes,
            &f.member,
            TTokenKind::Repair,
            &repair
        ))
        .await,
        (400, json!({"error":"INVALID_DATA"}))
    );
    assert_eq!(
        f.options
            .storage
            .state(&f.vault, TStateKind::Envelope, &[])
            .unwrap(),
        before
    );
}

#[tokio::test]
async fn repair_stores_replacement_registration_and_preserves_sk_refusal() {
    let (v, mut close, repair) = changed_repair().await;
    let f = &v.f;
    let start = opaque_start_registration(IStartClientRegistrationParams {
        password: "new password".into(),
    })
    .unwrap();
    let body = serde_json::to_vec(&json!({"message":start.registration_request})).unwrap();
    let (status, response) = f
        .run(token_request(
            f,
            "/v1/opaque/registration/start",
            "POST",
            &body,
            &f.member,
            TTokenKind::Repair,
            &repair,
        ))
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
    close.opaque_record = Some(binary(&finish.registration_record, None).unwrap());
    let body=serde_json::to_vec(&json!({"kind":"registration","message":finish.registration_record,"swap":text(&encode(&close).unwrap())})).unwrap();
    assert_eq!(
        f.run(token_request(
            f,
            "/v1/repair/finish",
            "POST",
            &body,
            &f.member,
            TTokenKind::Repair,
            &repair
        ))
        .await,
        (200, json!({"kind":"committed"}))
    );
    assert!(
        f.options
            .storage
            .vault(&f.vault)
            .unwrap()
            .unwrap()
            .sk_refused
    );
    assert_eq!(
        f.options
            .storage
            .state(&f.vault, TStateKind::OpaqueRecord, &[])
            .unwrap(),
        close.opaque_record
    );
    f.options
        .storage
        .put_device(
            &f.vault,
            &f.member.record.id,
            &IStoredDevice {
                client_version: "1.0.0".into(),
                ..Default::default()
            },
        )
        .unwrap();
    let mut request = f.request("/v1/envelope", "GET", &[], &f.member, |_| {});
    let r: IRequest =
        decode(&binary(request.headers()["envden-request"].to_str().unwrap(), None).unwrap())
            .unwrap();
    request.headers_mut().insert(
        "envden-proof",
        text(&sign(&v.sk.obj_sk, "sk-proof", &encode(&r).unwrap()))
            .parse()
            .unwrap(),
    );
    assert_eq!(f.run(request).await, (403, json!({"error":"LOCKED"})));
}
