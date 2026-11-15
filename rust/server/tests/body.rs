use axum::{body::Body, http::HeaderMap};
use envden_server::{
    http::encoding::{binary, text},
    middleware::body::{declared_body_size, read_body},
};
use sha2::{Digest, Sha256};

#[test]
fn declared_sizes_are_bounded() {
    for (value, allowed) in [
        ("0", true),
        ("10", true),
        ("0001", true),
        ("11", false),
        ("-1", false),
        ("1.0", false),
        ("1e1", false),
        ("", false),
        ("9007199254740992", false),
    ] {
        let mut headers = HeaderMap::new();
        headers.insert("content-length", value.parse().unwrap());
        assert_eq!(declared_body_size(&headers, 10).is_ok(), allowed, "{value}");
    }
    assert_eq!(declared_body_size(&HeaderMap::new(), 32).unwrap(), 32);
}

#[tokio::test]
async fn body_hash_and_capacity_are_enforced() {
    let digest = Sha256::digest(b"hello").into();
    assert_eq!(
        read_body(Body::from("hello"), 5, &digest).await.unwrap(),
        "hello"
    );
    assert_eq!(
        read_body(Body::from("hello"), 4, &digest)
            .await
            .unwrap_err()
            .code,
        envden_core::errors::ErrorCode::InvalidInput
    );
    assert_eq!(
        read_body(Body::from("jello"), 5, &digest)
            .await
            .unwrap_err()
            .code,
        envden_core::errors::ErrorCode::Unauthorized
    );
    assert!(
        read_body(Body::empty(), 0, &Sha256::digest([]).into())
            .await
            .is_ok()
    );
}

#[test]
fn encoding_rejects_noncanonical_and_wrong_lengths() {
    for value in ["", "=", "a", "a+", "a/", "Zg=", "Zh", " Zg"] {
        assert!(binary(value, None).is_err(), "{value}");
    }
    assert_eq!(binary("Zg", Some(1)).unwrap(), b"f");
    assert!(binary("Zg", Some(2)).is_err());
    assert_eq!(text(&[255, 254]), "__4");
}
