use crate::support::{Fixture, login, record};
use envden_server::http::encoding::text;
use serde_json::json;

#[tokio::test]
async fn login_finishes_once_and_binds_device() {
    for purpose in ["unlock", "kit"] {
        let f = Fixture::new();
        record(&f);
        let body = login(&f, purpose).await;
        let (who, other) = if purpose == "kit" {
            (&f.joiner, &f.member)
        } else {
            (&f.member, &f.joiner)
        };
        let expected = if purpose == "unlock" {
            (
                401,
                json!({"error":"UNAUTHORIZED","hint":"The vault may have moved; try the current server address"}),
            )
        } else {
            (403, json!({"error":"NOT_MEMBER"}))
        };
        assert_eq!(
            f.send("/v1/opaque/login/finish", "POST", body.clone(), other)
                .await,
            expected
        );
        let value = if purpose == "kit" {
            json!({"kind":"ticket"})
        } else {
            json!({"kind":"unlocked","unlockedUntil":2593000000_u64,"freshUntil":1600000})
        };
        assert_eq!(
            f.send("/v1/opaque/login/finish", "POST", body.clone(), who)
                .await,
            (200, value)
        );
        assert_eq!(
            f.send("/v1/opaque/login/finish", "POST", body, who).await,
            (
                401,
                json!({"error":"UNAUTHORIZED","hint":"The vault may have moved; try the current server address"})
            )
        );
    }
}

#[tokio::test]
async fn expired_login_cannot_finish() {
    let f = Fixture::new();
    record(&f);
    let body = login(&f, "unlock").await;
    f.advance(120000);
    assert_eq!(
        f.send("/v1/opaque/login/finish", "POST", body, &f.member)
            .await,
        (
            401,
            json!({"error":"UNAUTHORIZED","hint":"The vault may have moved; try the current server address"})
        )
    );
}

#[tokio::test]
async fn wrong_ke3_consumes_login_state() {
    let f = Fixture::new();
    record(&f);
    let body = login(&f, "unlock").await;
    for body in [json!({"purpose":"unlock","message":text(&[0;64])}), body] {
        assert_eq!(
            f.send("/v1/opaque/login/finish", "POST", body, &f.member)
                .await,
            (
                401,
                json!({"error":"UNAUTHORIZED","hint":"The vault may have moved; try the current server address"})
            )
        );
    }
}
