use crate::support::{Fixture, candidate, held};
use envden_server::middleware::budget::TBudget;
use serde_json::{Value, json};
use tower::ServiceExt;

#[tokio::test]
async fn invalid_nonmember_routes_do_not_read_or_reserve() {
    let f = Fixture::new();
    f.fresh();
    for _ in 0..2 {
        let (body, mut reading, _release) = held(b"{}");
        let request = f
            .request("/v1/files/vault", "POST", b"{}", &f.joiner, |_| {})
            .map(|_| body);
        assert_eq!(f.run(request).await, (404, json!({"error":"NOT_FOUND"})));
        assert!(reading.try_recv().is_err());
    }
    drop(f.budget.reserve(134217728, TBudget::Member, None).unwrap());
    assert_eq!(
        f.send("/v1/devices", "GET", Value::Null, &f.member).await.0,
        200
    );
}

#[tokio::test]
async fn bodiless_gets_reserve_nothing_with_full_budgets() {
    let f = Fixture::new();
    f.fresh();
    let _member = f.budget.reserve(134217728, TBudget::Member, None).unwrap();
    let _public = f.budget.reserve(1048576, TBudget::Public, None).unwrap();
    assert_eq!(
        f.send("/v1/devices", "GET", Value::Null, &f.member).await.0,
        200
    );
    assert_eq!(
        f.send("/v1/pairing/approver", "GET", Value::Null, &f.joiner)
            .await,
        (404, json!({"error":"NOT_FOUND"}))
    );
}

#[tokio::test]
async fn public_login_starts_are_charged_before_reading() {
    let f = Fixture::new();
    let mut held_requests = vec![];
    for _ in 0..5 {
        let (body, reading, release) = held(b"{}");
        let who = candidate("candidate");
        let request = f
            .request("/v1/opaque/login/start", "POST", b"{}", &who, |_| {})
            .map(|_| body);
        let task = tokio::spawn(f.app.clone().oneshot(request));
        reading.await.unwrap();
        held_requests.push((task, release));
    }
    assert_eq!(
        f.send(
            "/v1/opaque/login/start",
            "POST",
            json!({}),
            &candidate("sixth")
        )
        .await,
        (429, json!({"error":"RATE_LIMITED"}))
    );
    for (task, release) in held_requests {
        release.send(()).unwrap();
        assert_eq!(task.await.unwrap().unwrap().status(), 400);
    }
}

#[tokio::test]
async fn public_login_flood_cannot_consume_member_capacity() {
    let budget = envden_server::middleware::budget::BodyBudget::default();
    let fixtures: Vec<_> = (0..9)
        .map(|_| Fixture::with_budget(budget.clone()))
        .collect();
    let mut requests = vec![];
    for f in &fixtures[..8] {
        let (body, reading, release) = held(b"{}");
        let mut req = f
            .request("/v1/opaque/login/start", "POST", b"{}", &f.joiner, |_| {})
            .map(|_| body);
        req.headers_mut().remove("content-length");
        req.headers_mut()
            .insert("transfer-encoding", "chunked".parse().unwrap());
        let task = tokio::spawn(f.app.clone().oneshot(req));
        reading.await.unwrap();
        requests.push((task, release));
    }
    let f = &fixtures[8];
    assert_eq!(
        f.send("/v1/opaque/login/start", "POST", json!({}), &f.joiner)
            .await,
        (503, json!({"error":"BUSY"}))
    );
    f.fresh();
    assert_eq!(
        f.send(
            "/v1/settings/unlock-period",
            "PUT",
            json!({"period":null}),
            &f.member
        )
        .await,
        (200, json!({"period":null}))
    );
    for (task, release) in requests {
        release.send(()).unwrap();
        assert_eq!(task.await.unwrap().unwrap().status(), 400);
    }
}

#[tokio::test]
async fn ticket_authorized_nonmembers_cannot_block_members() {
    use envden_core::adapters::storage::{ISessionKey, TSessionKind};
    let f = Fixture::new();
    f.fresh();
    f.options
        .storage
        .put_session(
            &f.vault,
            &ISessionKey {
                kind: TSessionKind::JoinTicket,
                device: f.joiner.record.id.to_vec(),
                purpose: "kit".into(),
            },
            &[1],
            f.now(),
        )
        .unwrap();
    let mut requests = vec![];
    for _ in 0..2 {
        let (body, reading, release) = held(b"{}");
        let mut req = f
            .request("/v1/swap", "POST", b"{}", &f.joiner, |_| {})
            .map(|_| body);
        req.headers_mut().remove("content-length");
        req.headers_mut()
            .insert("transfer-encoding", "chunked".parse().unwrap());
        let task = tokio::spawn(f.app.clone().oneshot(req));
        reading.await.unwrap();
        requests.push((task, release));
    }
    assert_eq!(
        f.send("/v1/swap", "POST", json!({}), &f.joiner).await,
        (503, json!({"error":"BUSY"}))
    );
    assert_eq!(
        f.send(
            "/v1/settings/unlock-period",
            "PUT",
            json!({"period":null}),
            &f.member
        )
        .await,
        (200, json!({"period":null}))
    );
    for (task, release) in requests {
        release.send(()).unwrap();
        assert_eq!(task.await.unwrap().unwrap().status(), 400);
    }
}
