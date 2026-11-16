use super::*;
use serde_json::json;

#[test]
fn expired_window_prints_code_before_refusing() {
    let mut printed = String::new();
    let error = announce(
        "https://server.example",
        "007-code",
        42,
        || 42,
        |message| printed = message,
    )
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::Unauthorized);
    assert!(printed.contains("007-code"));
}

#[test]
fn ke3_second_get_failure_deletes_mailbox() {
    let (client, transport) = super::super::tests::client(vec![
        (200, json!({"message":"first","expiresAt":100})),
        (404, json!({"error":"NOT_FOUND"})),
        (200, json!({})),
    ]);
    let error = finish_login(&client, 7, &[0; 32], "invalid".into(), || 42, 100)
        .err()
        .unwrap();
    assert_eq!(error.code, ErrorCode::NotFound);
    assert_eq!(
        *transport.requests.borrow(),
        vec![
            ("GET".into(), "/v1/pairing/mailboxes/7/KE3".into()),
            ("GET".into(), "/v1/pairing/mailboxes/7/KE3".into()),
            ("DELETE".into(), "/v1/pairing/mailboxes/7".into()),
        ]
    );
}
