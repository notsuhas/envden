use crate::support::Fixture;
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn stream_caps_reject_oversized_bodies_on_every_auth_route() {
    for path in [
        "/v1/opaque/login/start",
        "/v1/pairing/mailboxes",
        "/v1/vault",
    ] {
        let f = Fixture::new();
        f.fresh();
        let bytes = vec![0; 65537];
        let dropped = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let body = crate::support::tracked(&bytes, dropped.clone());
        let mut request = f
            .request(path, "POST", &bytes, &f.member, |_| {})
            .map(|_| body);
        request.headers_mut().remove("content-length");
        request
            .headers_mut()
            .insert("transfer-encoding", "chunked".parse().unwrap());
        assert_eq!(
            f.run(request).await,
            (400, json!({"error":"INVALID_INPUT"})),
            "{path}"
        );
        assert!(dropped.load(std::sync::atomic::Ordering::SeqCst));
    }
}

#[tokio::test]
async fn read_routes_refuse_declared_bodies_including_public_hello() {
    let f = Fixture::new();
    for path in ["/v1/head", "/v1/hello"] {
        let request = f.request(path, "GET", b"x", &f.member, |_| {});
        assert_eq!(
            f.run(request).await,
            (400, json!({"error":"INVALID_INPUT"}))
        );
    }
}

#[tokio::test]
async fn blobs_allow_more_than_authentication_body_cap() {
    let f = Fixture::new();
    f.fresh();
    let bytes = vec![1; 65537];
    let path = format!(
        "/v1/blobs/{}",
        envden_server::http::encoding::text(&envden_protocol::protocol::h("blob", &bytes))
    );
    assert_eq!(
        f.run(f.request(&path, "PUT", &bytes, &f.member, |_| {}))
            .await,
        (200, json!({"kind":"uploaded"}))
    );
}

#[tokio::test]
async fn content_length_is_checked_before_reading() {
    let f = Fixture::new();
    f.fresh();
    let (body, mut reading, _release) = crate::support::held(b"small");
    let mut request = f
        .request(
            "/v1/opaque/login/start",
            "POST",
            b"small",
            &f.member,
            |_| {},
        )
        .map(|_| body);
    request
        .headers_mut()
        .insert("content-length", "65537".parse().unwrap());
    let response = f.app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), 400);
    assert!(reading.try_recv().is_err());
}
