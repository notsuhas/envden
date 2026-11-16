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

#[test]
fn head_answers_like_get_with_no_body_without_an_origin() {
    tokio::runtime::Runtime::new().unwrap().block_on(async {
        let app = create_dashboard_app(
            4100,
            "token".into(),
            Arc::new(|_| Ok(serde_json::json!({"devices": []}))),
        );

        for path in ["/", "/api/devices", "/nope"] {
            let request = |method| {
                Request::builder()
                    .uri(path)
                    .method(method)
                    .header("Host", "127.0.0.1:4100")
                    .header("Authorization", "Bearer token")
                    .body(Body::empty())
                    .unwrap()
            };
            let get = app.clone().oneshot(request("GET")).await.unwrap();
            let head = app.clone().oneshot(request("HEAD")).await.unwrap();
            let get_status = get.status();
            let mut get_headers = get.headers().clone();
            let mut head_headers = head.headers().clone();

            get_headers.remove("content-length");
            let length = head_headers.remove("content-length").unwrap();
            let body = axum::body::to_bytes(get.into_body(), usize::MAX)
                .await
                .unwrap();

            assert_eq!((path, head.status()), (path, get_status));
            assert_eq!(head_headers, get_headers, "{path}");
            assert_eq!(length, body.len().to_string().as_str(), "{path}");
            assert!(
                axum::body::to_bytes(head.into_body(), usize::MAX)
                    .await
                    .unwrap()
                    .is_empty()
            );
        }
    });
}
