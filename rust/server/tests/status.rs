mod fixture;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use envden_core::adapters::{
    VAULT_QUOTA_BYTES,
    storage::{IRestoredVault, IStoredVault},
};
use envden_server::{
    create_app,
    status::{IStatusState, admit_request, derive_quota_band, derive_server_mode},
};
use std::sync::{Arc, Mutex};
use tower::ServiceExt;

#[test]
fn mode_decisions() {
    let vault = IStoredVault {
        active: true,
        ..Default::default()
    };
    let moved = IStoredVault {
        server_moved: Some(vec![0; 32]),
        ..vault.clone()
    };
    let restored = IStoredVault {
        restored: Some(IRestoredVault {
            repair_token_hash: vec![0; 32],
            restored_head: vec![0; 32],
            finish_progress: None,
        }),
        ..vault.clone()
    };
    assert_eq!(derive_server_mode(&[]), "normal");
    assert_eq!(derive_server_mode(&[vault, moved.clone()]), "normal");
    assert_eq!(derive_server_mode(&[moved.clone(), moved.clone()]), "moved");
    assert_eq!(derive_server_mode(&[moved, restored]), "restored");
}

#[test]
fn quota_follows_fullest_vault() {
    let q = VAULT_QUOTA_BYTES;
    for (values, expected) in [
        (vec![], None),
        (vec![0, q * 49 / 100], Some("below-50")),
        (vec![q / 2, 0], Some("50-80")),
        (vec![q * 8 / 10 + 1], Some("80-95")),
        (vec![q * 95 / 100 - 1], Some("80-95")),
        (vec![q * 2], Some("95-plus")),
    ] {
        assert_eq!(derive_quota_band(&values), expected);
    }
}

#[test]
fn sixty_requests_per_minute() {
    let mut window = None;
    for _ in 0..60 {
        window = admit_request(window, 1000);
        assert!(window.is_some());
    }
    assert!(admit_request(window, 60999).is_none());
    assert_eq!(admit_request(window, 61000), Some((61000, 1)));
}

#[test]
fn only_off_disables_status() {
    for (setting, enabled) in [(None, true), (Some("on"), true), (Some("off"), false)] {
        let state = IStatusState::new(5, setting);
        assert_eq!(state.enabled, enabled);
        assert_eq!(state.started_at, 5);
    }
}

#[tokio::test]
async fn unsigned_page_and_json_have_strict_headers_and_order() {
    let (_directory, options) = fixture::fixture();
    let app = create_app(
        options,
        Arc::new(Mutex::new(IStatusState::new(1000000, None))),
    )
    .unwrap();
    for path in ["/", "/v1/status"] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert_eq!(response.headers()["x-frame-options"], "DENY");
        assert_eq!(response.headers()["referrer-policy"], "no-referrer");
        let csp = response.headers()["content-security-policy"]
            .to_str()
            .unwrap()
            .to_owned();
        let body = String::from_utf8(
            to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap()
                .to_vec(),
        )
        .unwrap();
        if path == "/" {
            assert!(body.contains("envden ui"));
            assert!(!body.contains("<script"));
            assert!(csp.contains("frame-ancestors 'none'"));
        } else {
            assert_eq!(
                body,
                r#"{"version":"1.0.0","uptimeSeconds":0,"mode":"normal","vaults":0,"storageBytes":0,"fullestVault":null,"lastPrune":null}"#
            );
        }
    }
}

#[tokio::test]
async fn disabled_status_returns_json_404() {
    let (_directory, options) = fixture::fixture();
    let app = create_app(
        options,
        Arc::new(Mutex::new(IStatusState::new(0, Some("off")))),
    )
    .unwrap();
    for path in ["/", "/v1/status"] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), 404);
        assert_eq!(
            to_bytes(response.into_body(), usize::MAX).await.unwrap(),
            r#"{"error":"NOT_FOUND"}"#
        );
    }
}

#[tokio::test]
async fn rate_limits_both_status_routes_together_and_refuses_body() {
    let (_directory, options) = fixture::fixture();
    let app = create_app(options, Arc::new(Mutex::new(IStatusState::new(0, None)))).unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/")
                .header("content-length", "1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    for _ in 0..60 {
        assert_eq!(
            app.clone()
                .oneshot(
                    Request::builder()
                        .uri("/v1/status")
                        .body(Body::empty())
                        .unwrap()
                )
                .await
                .unwrap()
                .status(),
            200
        );
    }
    assert_eq!(
        app.oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap()
            .status(),
        429
    );
}

#[tokio::test]
async fn head_on_a_get_route_answers_like_get_with_no_body() {
    let (_directory, options) = fixture::fixture();
    let app = create_app(options, Arc::new(Mutex::new(IStatusState::new(0, None)))).unwrap();
    let hello = format!("/v1/hello?challenge={}", "A".repeat(43));

    for path in [
        "/",
        "/v1/status",
        &hello,
        "/v1/head",
        "/v1/devices",
        "/nope",
    ] {
        let request = |method| {
            Request::builder()
                .method(method)
                .uri(path)
                .body(Body::empty())
                .unwrap()
        };
        let get = app.clone().oneshot(request("GET")).await.unwrap();
        let head = app.clone().oneshot(request("HEAD")).await.unwrap();
        let mut get_headers = get.headers().clone();
        get_headers.remove("content-length");

        assert_eq!((path, head.status()), (path, get.status()));

        let mut headers = head.headers().clone();
        let length = headers.remove("content-length").unwrap();
        let body = to_bytes(get.into_body(), usize::MAX).await.unwrap();

        assert_eq!(headers, get_headers, "{path}");
        assert_eq!(length, body.len().to_string().as_str(), "{path}");
        assert!(
            to_bytes(head.into_body(), usize::MAX)
                .await
                .unwrap()
                .is_empty()
        );
    }
}
