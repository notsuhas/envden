use crate::support::Fixture;
use envden_core::adapters::storage::{IStateWrite, TStateKind};
use envden_protocol::protocol::*;
use envden_server::http::encoding::binary;
use serde_json::{Value, json};

pub(crate) fn record(f: &Fixture) {
    let start = opaque_start_registration(IStartClientRegistrationParams {
        password: "password".into(),
    })
    .unwrap();
    let response = opaque_registration_response(ICreateServerRegistrationResponseParams {
        server_setup: f.options.server_keys.opaque_setup.clone(),
        user_identifier: unlock_identifiers(&f.vault).user_identifier,
        registration_request: start.registration_request,
    })
    .unwrap();
    let record = opaque_finish_registration(IFinishClientRegistrationParams {
        password: "password".into(),
        client_registration_state: start.client_registration_state,
        registration_response: response.registration_response,
        identifiers: Some(unlock_identifiers(&f.vault).identifiers),
        key_stretching_function_config: None,
    })
    .unwrap();
    f.options
        .storage
        .write_state(
            &f.vault,
            &[IStateWrite {
                kind: TStateKind::OpaqueRecord,
                key: vec![],
                bytes: Some(binary(&record.registration_record, None).unwrap()),
            }],
        )
        .unwrap();
}

pub(crate) async fn login(f: &Fixture, purpose: &str) -> Value {
    let who = if purpose == "kit" {
        &f.joiner
    } else {
        &f.member
    };
    let start = opaque_start_login(IStartClientLoginParams {
        password: "password".into(),
    })
    .unwrap();
    let (status, response) = f
        .send(
            "/v1/opaque/login/start",
            "POST",
            json!({"purpose":purpose,"message":start.start_login_request}),
            who,
        )
        .await;
    assert_eq!(status, 200);
    let finish = opaque_finish_login(IFinishClientLoginParams {
        password: "password".into(),
        client_login_state: start.client_login_state,
        login_response: response["message"].as_str().unwrap().into(),
        identifiers: Some(unlock_identifiers(&f.vault).identifiers),
        key_stretching_function_config: None,
    })
    .unwrap()
    .unwrap();
    json!({"purpose":purpose,"message":finish.finish_login_request})
}
