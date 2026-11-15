use crate::support::{Fixture, login, record};
use envden_protocol::protocol::*;
use serde_json::json;

#[tokio::test]
async fn member_starts_lock_independently_of_kit_and_finish_refunds() {
    let f = Fixture::new();
    record(&f);
    let start = opaque_start_login(IStartClientLoginParams {
        password: "password".into(),
    })
    .unwrap();
    let body = json!({"purpose":"unlock","message":start.start_login_request});
    for _ in 0..4 {
        assert_eq!(
            f.send("/v1/opaque/login/start", "POST", body.clone(), &f.member)
                .await
                .0,
            200
        );
    }
    let finish = login(&f, "unlock").await;
    assert_eq!(
        f.send("/v1/opaque/login/start", "POST", body.clone(), &f.member)
            .await,
        (429, json!({"error":"RATE_LIMITED"}))
    );
    assert_eq!(
        f.send(
            "/v1/opaque/login/start",
            "POST",
            json!({"purpose":"kit","message":start.start_login_request}),
            &f.joiner
        )
        .await
        .0,
        200
    );
    assert_eq!(
        f.send("/v1/opaque/login/finish", "POST", finish, &f.member)
            .await
            .0,
        200
    );
    assert_eq!(
        f.send("/v1/opaque/login/start", "POST", body.clone(), &f.member)
            .await
            .0,
        200
    );
    assert_eq!(
        f.send("/v1/opaque/login/start", "POST", body, &f.member)
            .await,
        (429, json!({"error":"RATE_LIMITED"}))
    );
}

#[tokio::test]
async fn kit_failures_share_vault_bucket_but_not_member_bucket() {
    let f = Fixture::new();
    record(&f);
    let start = opaque_start_login(IStartClientLoginParams {
        password: "password".into(),
    })
    .unwrap();
    let body = json!({"purpose":"kit","message":start.start_login_request});
    for _ in 0..5 {
        assert_eq!(
            f.send("/v1/opaque/login/start", "POST", body.clone(), &f.joiner)
                .await
                .0,
            200
        );
    }
    assert_eq!(
        f.send("/v1/opaque/login/start", "POST", body, &f.joiner)
            .await,
        (429, json!({"error":"RATE_LIMITED"}))
    );
    assert_eq!(
        f.send(
            "/v1/opaque/login/start",
            "POST",
            json!({"purpose":"unlock","message":start.start_login_request}),
            &f.member
        )
        .await
        .0,
        200
    );
}
