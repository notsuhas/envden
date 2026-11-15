use super::*;
use envden_core::errors::{EnvdenError, ErrorCode};
use serde_json::json;
use std::rc::Rc;

#[path = "tests/fixture.rs"]
mod fixture;
use fixture::fixture;

#[test]
fn exact_body_query_signatures_and_locked_retry() {
    let (mut client, transport, _) = fixture();
    transport.failure.set(Some(ErrorCode::Locked));
    let unlock = transport.clone();
    client.options.unlock = Some(Rc::new(move || {
        unlock.failure.set(None);
        Ok(())
    }));
    client
        .request("/v1/test?q=1", "POST", Some(&json!({"message":"test"})))
        .unwrap();
    assert_eq!(transport.attempts.get(), 2);
    assert_eq!(
        client
            .request("https://other.example/", "GET", None)
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
}

#[test]
fn busy_retries_have_fresh_nonces_and_bounded_backoff() {
    let (client, transport, delays) = fixture();
    transport.failure.set(Some(ErrorCode::Busy));
    assert_eq!(
        client.request("/v1/head", "GET", None).unwrap_err().code,
        ErrorCode::Busy
    );
    assert_eq!(*delays.borrow(), [100, 200]);
    let mut nonces = transport.nonces.borrow().clone();
    nonces.sort();
    nonces.dedup();
    assert_eq!(nonces.len(), 3);
}

#[test]
fn kit_required_never_unlocks_and_binary_transport_signs_bytes() {
    let (mut client, transport, _) = fixture();
    client
        .request_bytes("/v1/swap", "POST", &[1, 2, 3])
        .unwrap();
    transport.failure.set(Some(ErrorCode::RecoveryKitRequired));
    client.options.unlock = Some(Rc::new(|| panic!("must not unlock")));
    assert_eq!(
        client.request("/v1/head", "GET", None).unwrap_err().code,
        ErrorCode::RecoveryKitRequired
    );
    assert_eq!(transport.attempts.get(), 2);
}

#[test]
fn hello_rejects_wrong_pin_and_newer_minimum() {
    let (client, transport, _) = fixture();
    assert_eq!(
        hello(
            &client.options.address,
            Some(&[0; 32]),
            &*transport,
            "0.0.0"
        )
        .err()
        .unwrap()
        .code,
        ErrorCode::Unauthorized
    );
    assert_eq!(
        hello(&client.options.address, None, &*transport, "2.0.0")
            .err()
            .unwrap()
            .code,
        ErrorCode::ServerTooOld
    );
}

#[test]
fn errors_and_encoding_match_reference() {
    for (value, path, code, message) in [
        (
            json!({"error":"SERVER_UNREACHABLE"}),
            "",
            ErrorCode::ServerUnreachable,
            "Server can't reach its storage. Try again later",
        ),
        (
            json!({"error":"MADE_UP"}),
            "",
            ErrorCode::InvalidData,
            "Invalid server response",
        ),
        (
            json!({"error":"CONFLICT"}),
            "/v1/pairing/mailboxes/4/a",
            ErrorCode::Conflict,
            "Pairing code expired or already used. Run envden device add for a new one",
        ),
    ] {
        let error = response_error(&value, path);
        assert_eq!(error.code, code);
        assert_eq!(error.message, message);
    }
    assert!(binary("AA==").is_err());
    assert!(binary("AB").is_err());
    assert_eq!(binary(&text(&[0, 255])).unwrap(), [0, 255]);
    let mut calls = 0;
    assert!(
        retry_head::<()>(|| {
            calls += 1;
            Err(EnvdenError::new(ErrorCode::HeadMoved, "moved"))
        })
        .is_err()
    );
    assert_eq!(calls, 3);
}

#[test]
fn authenticated_success_clears_only_scoped_update_marker() {
    let home = tempfile::tempdir().unwrap();
    let marker = home.path().join("state/update-required");
    std::fs::create_dir_all(marker.parent().unwrap()).unwrap();
    std::fs::write(&marker, crate::version::VERSION).unwrap();
    let (client, transport, _) = fixture();
    client.request("/v1/head", "GET", None).unwrap();
    assert!(marker.exists());
    crate::updates::status::with_update_status(home.path(), || {
        transport.failure.set(Some(ErrorCode::Locked));
        assert!(client.request("/v1/head", "GET", None).is_err());
        assert!(marker.exists());
        transport.failure.set(None);
        client.request("/v1/head", "GET", None).unwrap();
        assert!(!marker.exists());
    });
}
