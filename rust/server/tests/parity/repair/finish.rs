use crate::support::{Fixture, token_request};
use envden_protocol::protocol::*;
use envden_server::http::encoding::text;
use serde_json::{Value, json};

pub async fn finish_login(f: &Fixture, repair: &[u8; 32], swap: &ISwap) -> (u16, Value) {
    let start = opaque_start_login(IStartClientLoginParams {
        password: "password".into(),
    })
    .unwrap();
    let body = serde_json::to_vec(&json!({"purpose":"unlock","message":start.start_login_request}))
        .unwrap();
    let (status, body) = f
        .run(token_request(
            f,
            "/v1/opaque/login/start",
            "POST",
            &body,
            &f.member,
            TTokenKind::Repair,
            repair,
        ))
        .await;
    assert_eq!(status, 200);
    let finish = opaque_finish_login(IFinishClientLoginParams {
        client_login_state: start.client_login_state,
        login_response: body["message"].as_str().unwrap().into(),
        password: "password".into(),
        identifiers: Some(unlock_identifiers(&f.vault).identifiers),
        key_stretching_function_config: None,
    })
    .unwrap()
    .unwrap();
    let body=serde_json::to_vec(&json!({"kind":"login","purpose":"unlock","message":finish.finish_login_request,"swap":text(&encode(swap).unwrap())})).unwrap();

    f.run(token_request(
        f,
        "/v1/repair/finish",
        "POST",
        &body,
        &f.member,
        TTokenKind::Repair,
        repair,
    ))
    .await
}
