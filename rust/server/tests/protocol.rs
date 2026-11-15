mod fixture;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use envden_core::errors::{EnvdenError, ErrorCode};
use envden_protocol::protocol::*;
use envden_server::{
    create_app,
    http::{
        encoding::{binary, text},
        errors::error_response,
    },
    status::IStatusState,
};
use std::sync::{Arc, Mutex};
use tower::ServiceExt;

#[tokio::test]
async fn hello_is_signed_for_challenge_hostname_and_versions() {
    let (_directory, options) = fixture::fixture();
    let pin = server_pin(&options.server_keys.public_key).unwrap();
    let app = create_app(options, Arc::new(Mutex::new(IStatusState::new(0, None)))).unwrap();
    let challenge = [1; 32];
    let request = Request::builder()
        .uri(format!("/v1/hello?challenge={}", text(&challenge)))
        .header("host", "Example.COM:1234")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["content-type"], "application/json");
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let hello: ISigned<IServerHello> =
        decode(&binary(value["hello"].as_str().unwrap(), None).unwrap()).unwrap();
    assert!(matches!(
        verify_hello(&hello, &challenge, "example.com", &pin, "0.0.0"),
        TVerification::Valid(_)
    ));
    assert_eq!(hello.body.app_version, "1.0.0");
    assert_eq!(hello.body.protocols, [1]);
}

#[tokio::test]
async fn unsigned_routes_and_unknown_methods_have_reference_bodies() {
    let (_directory, options) = fixture::fixture();
    let app = create_app(options, Arc::new(Mutex::new(IStatusState::new(0, None)))).unwrap();
    for (method, path, status, expected) in [
        ("GET", "/v1/hello", 400, r#"{"error":"INVALID_INPUT"}"#),
        ("POST", "/v1/hello", 404, r#"{"error":"NOT_FOUND"}"#),
        ("GET", "/v1/unknown", 404, r#"{"error":"NOT_FOUND"}"#),
        ("GET", "/unknown", 404, "404 Not Found"),
        ("GET", "/v1/head", 400, r#"{"error":"INVALID_INPUT"}"#),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(path)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), status, "{path}");
        assert_eq!(
            to_bytes(response.into_body(), usize::MAX).await.unwrap(),
            expected,
            "{path}"
        );
    }
}

#[tokio::test]
async fn error_mapping_and_login_hint_are_exact() {
    for (code, status) in [
        (ErrorCode::Busy, 503),
        (ErrorCode::InvalidInput, 400),
        (ErrorCode::InvalidData, 400),
        (ErrorCode::UpdateRequired, 426),
        (ErrorCode::Rollback, 409),
        (ErrorCode::Fork, 409),
        (ErrorCode::NotMember, 403),
        (ErrorCode::Unauthorized, 401),
        (ErrorCode::Locked, 403),
        (ErrorCode::RecoveryKitRequired, 409),
        (ErrorCode::StorageQuota, 507),
        (ErrorCode::RateLimited, 429),
        (ErrorCode::Conflict, 409),
        (ErrorCode::NotFound, 404),
        (ErrorCode::HeadMoved, 409),
        (ErrorCode::RestoredMode, 409),
        (ErrorCode::Moving, 409),
        (ErrorCode::ServerTooOld, 426),
        (ErrorCode::ClientTooOld, 426),
        (ErrorCode::NotImplemented, 501),
        (ErrorCode::Internal, 500),
        (ErrorCode::ServerUnreachable, 502),
    ] {
        let response = error_response(&EnvdenError::new(code, "private canary"), "/v1/head");
        assert_eq!(response.status(), status);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(body, format!("{{\"error\":\"{code}\"}}"));
    }
    let response = error_response(
        &EnvdenError::new(ErrorCode::Unauthorized, "private canary"),
        "/v1/opaque/login/finish",
    );
    assert_eq!(
        to_bytes(response.into_body(), usize::MAX).await.unwrap(),
        r#"{"error":"UNAUTHORIZED","hint":"The vault may have moved; try the current server address"}"#
    );
}
