use super::app::{SECURITY_HEADERS, create_dashboard_app};
use axum::{body::Body, http::Request};
use http_body_util::BodyExt;
use std::sync::Arc;
use tower::ServiceExt;

#[test]
fn auth_host_origin_and_assets() {
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let app = create_dashboard_app(
            4100,
            "token".into(),
            Arc::new(|_| Ok(serde_json::json!({"kind":"not-configured"}))),
        );
        for (path, method, host, auth, origin, status) in [
            ("/api/status", "GET", "127.0.0.1:4100", "", "", 401),
            (
                "/api/status",
                "GET",
                "127.0.0.1:4100",
                "Bearer nope",
                "",
                401,
            ),
            (
                "/api/status",
                "GET",
                "evil.example:4100",
                "Bearer token",
                "",
                421,
            ),
            ("/", "GET", "evil.example:4100", "", "", 421),
            (
                "/api/push",
                "POST",
                "127.0.0.1:4100",
                "Bearer token",
                "http://evil.example",
                403,
            ),
            (
                "/api/pull",
                "POST",
                "127.0.0.1:4100",
                "Bearer token",
                "",
                403,
            ),
            (
                "/api/status",
                "GET",
                "127.0.0.1:4100",
                "Bearer token",
                "",
                200,
            ),
            ("/", "GET", "127.0.0.1:4100", "", "", 200),
            ("/missing", "GET", "127.0.0.1:4100", "", "", 404),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .method(method)
                        .header("Host", host)
                        .header("Authorization", auth)
                        .header("Origin", origin)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status().as_u16(), status, "{method} {path} {host}");
            for (name, value) in SECURITY_HEADERS {
                assert_eq!(response.headers().get(*name).unwrap(), *value);
            }
            let bytes = response.into_body().collect().await.unwrap().to_bytes();
            if path == "/" && status == 200 {
                assert_eq!(bytes.as_ref(), include_bytes!("../assets/index.html.bin"));
            }
            if path == "/api/status" && status == 200 {
                assert_eq!(bytes.as_ref(), br#"{"kind":"not-configured"}"#);
            }
        }
    });
}
