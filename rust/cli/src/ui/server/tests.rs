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

#[test]
fn request_routes_receive_method_query_and_body() {
    use super::app::create_request_dashboard_app;
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let app=create_request_dashboard_app(4100,"token".into(),Arc::new(|request| {
            if request.path!="/api/devices/rename" {return Ok(None);}
            Ok(Some(serde_json::json!({"method":request.method,"query":request.query,"body":request.body})))
        }));
        let response=app.clone().oneshot(Request::builder().uri("/api/devices/rename?root=%2Fa").method("POST").header("Host","127.0.0.1:4100").header("Origin","http://127.0.0.1:4100").header("Authorization","Bearer token").body(Body::from(r#"{"name":"laptop"}"#)).unwrap()).await.unwrap();
        assert_eq!(response.status(),200);
        let bytes=response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(&bytes[..],br#"{"method":"POST","query":"root=%2Fa","body":{"name":"laptop"}}"#);
        let response=app.oneshot(Request::builder().uri("/api/unknown").header("Host","127.0.0.1:4100").header("Authorization","Bearer token").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(response.status(),404);
    });
}

#[test]
fn rejects_requests_before_polling_the_body() {
    tokio::runtime::Runtime::new().unwrap().block_on(async {
        let app = create_dashboard_app(4100, "token".into(), Arc::new(|_| panic!("API called")));
        for (host, auth, origin, expected) in [
            ("evil", "Bearer token", "http://127.0.0.1:4100", 421),
            ("127.0.0.1:4100", "", "http://127.0.0.1:4100", 401),
            ("127.0.0.1:4100", "Bearer token", "http://evil", 403),
        ] {
            let body = http_body_util::Full::new(axum::body::Bytes::from_static(b"{}"))
                .map_frame(|_| panic!("body polled before guards"));
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/push")
                        .method("POST")
                        .header("Host", host)
                        .header("Authorization", auth)
                        .header("Origin", origin)
                        .body(Body::new(body))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
        }
    });
}

#[test]
fn routes_without_json_input_do_not_poll_request_bodies() {
    tokio::runtime::Runtime::new().unwrap().block_on(async {
        let app = create_dashboard_app(
            4100,
            "token".into(),
            Arc::new(|_| Ok(serde_json::json!({}))),
        );
        for (method, path, status) in [
            ("GET", "/", 200),
            ("GET", "/api/status", 200),
            ("POST", "/api/push", 200),
        ] {
            let body = http_body_util::Full::new(axum::body::Bytes::from_static(b"{}"))
                .map_frame(|_| panic!("route has no JSON body input"));
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .method(method)
                        .header("Host", "127.0.0.1:4100")
                        .header("Authorization", "Bearer token")
                        .header("Origin", "http://127.0.0.1:4100")
                        .body(Body::new(body))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), status);
        }
    });
}
