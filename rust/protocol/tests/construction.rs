use envden_protocol::protocol::*;
use sha2::{Digest, Sha256};
#[test]
fn pairing_codes_and_directional_keys() {
    for input in ["1-000G-40R4", "1 000g 40r4", "1000G40R4"] {
        assert_eq!(
            normalize_pairing_code(input).unwrap(),
            (1, "000G40R4".into())
        );
    }
    for input in [
        "0-000G-40R4",
        "01-000G-40R4",
        "1000-000G-40R4",
        "1-000G-40RU",
        "1\t000G40R4",
        "100-0G-40R4",
    ] {
        assert!(normalize_pairing_code(input).is_err(), "{input}");
    }
    let (a, b) = pairing_channel_keys(&[1; 64]).unwrap();
    assert_ne!(a, b);
    assert!(pairing_channel_keys(&[1; 32]).is_err());
}
#[test]
fn opaque_message_identity_and_shape_rejections() {
    for s in ["!", "AA=", "AB", "AAAA", ""] {
        assert!(opaque_message(s, 1).is_err());
    }
    assert_eq!(opaque_message("AA", 1).unwrap(), "AA");
    assert_eq!(
        unlock_identifiers(&[0; 32]).identifiers.server.unwrap(),
        "envden/v1/unlock-server"
    );
    assert_eq!(
        pairing_identifiers(&[0; 32], 1)
            .unwrap()
            .identifiers
            .client
            .unwrap(),
        "envden/v1/pair/joiner"
    );
    assert!(pairing_identifiers(&[0; 32], 0).is_err());
    assert!(
        opaque_server_finish_login(IFinishServerLoginParams {
            server_login_state: "AA".into(),
            finish_login_request: "AA".into(),
            identifiers: None
        })
        .is_err()
    );
}
#[test]
fn request_time_replay_binding_and_hello() {
    let sk = [1; 32];
    let public = ed25519_dalek::SigningKey::from_bytes(&sk)
        .verifying_key()
        .to_bytes();
    let pin = server_pin(&public).unwrap();
    let r = IRequest {
        server_pin: pin,
        vault_id: [3; 32],
        method: "POST".into(),
        path_and_query: "/swap".into(),
        body_hash: Sha256::digest(b"body").into(),
        time: 400000,
        nonce: [4; 16],
        device: [5; 16],
        client_version: "1.0.0".into(),
    };
    let v = sign_request(r, &sk).unwrap();
    for now in [100001, 400000, 699999] {
        assert!(matches!(
            verify_request(&v, &public, &pin, b"body", now, false),
            TVerification::Valid(_)
        ));
    }
    for now in [100000, 700000] {
        assert!(matches!(
            verify_request(&v, &public, &pin, b"body", now, false),
            TVerification::Invalid {
                reason: "Expired or replayed request"
            }
        ));
    }
    assert!(matches!(
        verify_request(&v, &public, &pin, b"wrong", 400000, false),
        TVerification::Invalid {
            reason: "Request binding mismatch"
        }
    ));
    assert!(matches!(
        verify_request(&v, &public, &pin, b"body", 400000, true),
        TVerification::Invalid { .. }
    ));
    let hello = build_hello(
        IServerHello {
            challenge: [6; 32],
            host: "example.com".into(),
            server_sign_pub: public,
            app_version: "1.2.0".into(),
            min_client: "1.0.0".into(),
            protocols: vec![1],
        },
        &sk,
    )
    .unwrap();
    assert!(matches!(
        verify_hello(&hello, &[6; 32], "EXAMPLE.COM", &pin, "1.1.0"),
        TVerification::Valid(_)
    ));
    assert!(matches!(
        verify_hello(&hello, &[6; 32], "example.com", &pin, "2.0.0"),
        TVerification::Invalid { .. }
    ));
}
#[test]
fn json_schema_strictness_and_limits() {
    use serde_json::{from_value, json};
    assert!(from_value::<ILoginStart>(json!({"purpose":"unlock","message":"AA"})).is_err());
    for value in [
        json!({"period":0}),
        json!({"period":86400000,"extra":true}),
        json!({}),
    ] {
        assert!(from_value::<IUnlockPeriod>(value).is_err());
    }
    assert!(from_value::<IUnlockPeriod>(json!({"period":null})).is_ok());
    assert!(from_value::<IUnlockPeriod>(json!({"period":86400000})).is_ok());
    assert!(from_value::<IMailboxOpened>(json!({"number":0,"expiresAt":1})).is_err());
    assert!(from_value::<IMailboxOpened>(json!({"number":999,"expiresAt":-1})).is_ok());
    assert!(from_value::<TCommitResponse>(json!({"kind":"committed","head":"x"})).is_err());
    assert!(from_value::<TCommitResponse>(json!({"kind":"head-moved","head":null})).is_err());
    assert!(from_value::<IObjectsResponse>(json!({"objects":["!"]})).is_err());
    assert!(from_value::<IErrorResponse>(json!({"error":"INVALID_DATA"})).is_ok());
    assert!(from_value::<IErrorResponse>(json!({"error":"UNKNOWN"})).is_err());
}
