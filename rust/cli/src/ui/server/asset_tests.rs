use super::app::create_dashboard_app;
use axum::{body::Body, http::Request};
use http_body_util::BodyExt;
use std::sync::Arc;
use tower::ServiceExt;

#[tokio::test]
async fn dashboard_serves_the_reference_asset_set() {
    use sha2::{Digest, Sha256};

    let app = create_dashboard_app(4100, "token".into(), Arc::new(|_| panic!("unexpected API")));
    let html = std::str::from_utf8(super::assets::asset("/").unwrap().1).unwrap();
    for (path, kind, length, digest) in [
        (
            "/",
            "text/html;charset=utf-8",
            2084,
            "28a33073079671c6b094b28c6239f8d34453e4173fd16f4e7d4a6906cf6b9a2c",
        ),
        (
            "/chunk-71vsc44b.css",
            "text/css;charset=utf-8",
            9856,
            "0512837b9695d211d0b547fb88872371e09e8729892959fe147ffb04f767e3b0",
        ),
        (
            "/chunk-yq6gjs3r.js",
            "text/javascript;charset=utf-8",
            70852,
            "43a022c5798a1d6b86dd5508f05ec0ecd401af61438dec482e642945370ac181",
        ),
    ] {
        if path != "/" {
            assert!(html.contains(&format!("\"{path}\"")));
        }
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(path)
                    .header("host", "127.0.0.1:4100")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 200, "{path}");
        assert_eq!(response.headers()["content-type"], kind);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(bytes.len(), length, "{path}");
        assert_eq!(format!("{:x}", Sha256::digest(&bytes)), digest, "{path}");
        let head = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("HEAD")
                    .uri(path)
                    .header("host", "127.0.0.1:4100")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(head.headers()["content-length"], length.to_string());
        assert!(
            head.into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .is_empty()
        );
    }
    assert!(super::assets::asset("/chunk-jtq8kjdg.js").is_none());
    assert!(super::assets::asset("/chunk-9nqj0wqq.css").is_none());
}
