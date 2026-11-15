use crate::support::{Fixture, candidate};
use envden_server::http::encoding::text;
use serde_json::{Value, json};

const PATH: &str = "/v1/pairing/mailboxes";
async fn open(f: &Fixture) -> u64 {
    let (status, body) = f.send(PATH, "POST", json!({}), &f.member).await;
    assert_eq!(status, 200);
    let number = body["number"].as_u64().unwrap();
    assert_eq!(body, json!({"number":number,"expiresAt":f.now()+600000}));
    number
}

#[tokio::test]
async fn slots_enforce_sides_order_identical_retries_and_close_on_conflict() {
    let f = Fixture::new();
    assert_eq!(
        f.send(PATH, "POST", json!({}), &f.member).await,
        (403, json!({"error":"LOCKED"}))
    );
    f.fresh();
    assert_eq!(open(&f).await, 1);
    let base = format!("{PATH}/1");
    let expires = f.now() + 600000;
    let ke1 = json!({"message":text(&[1;96])});
    assert_eq!(
        f.send(&format!("{base}/KE1"), "PUT", ke1.clone(), &f.member)
            .await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
    for kind in ["written", "identical"] {
        assert_eq!(
            f.send(&format!("{base}/KE1"), "PUT", ke1.clone(), &f.joiner)
                .await,
            (200, json!({"kind":kind,"expiresAt":expires}))
        );
    }
    assert_eq!(
        f.send(
            &format!("{base}/PairJoiner"),
            "PUT",
            json!({"message":text(&[1;42])}),
            &f.joiner
        )
        .await,
        (409, json!({"error":"CONFLICT"}))
    );
    assert_eq!(
        f.send(&format!("{base}/KE1"), "GET", Value::Null, &f.member)
            .await,
        (200, json!({"message":text(&[1;96]),"expiresAt":expires}))
    );
    assert_eq!(
        f.send(
            &format!("{base}/KE2"),
            "PUT",
            json!({"message":text(&[1;320])}),
            &f.joiner
        )
        .await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
    for (slot, size, who) in [
        ("KE2", 320, &f.member),
        ("KE3", 64, &f.joiner),
        ("PairJoiner", 42, &f.joiner),
    ] {
        assert_eq!(
            f.send(
                &format!("{base}/{slot}"),
                "PUT",
                json!({"message":text(&vec![1;size])}),
                who
            )
            .await,
            (200, json!({"kind":"written","expiresAt":expires}))
        );
    }
    assert_eq!(
        f.send(
            &format!("{base}/KE1"),
            "PUT",
            json!({"message":text(&[2;96])}),
            &f.joiner
        )
        .await,
        (409, json!({"error":"CONFLICT"}))
    );
    assert_eq!(
        f.send(&format!("{base}/KE1"), "GET", Value::Null, &f.member)
            .await,
        (404, json!({"error":"NOT_FOUND"}))
    );
}

#[tokio::test]
async fn expiry_binding_limits_and_number_reuse() {
    let f = Fixture::new();
    f.fresh();
    let number = open(&f).await;
    let slot = format!("{PATH}/{number}/KE1");
    let message = json!({"message":text(&[1;96])});
    assert_eq!(
        f.send(&slot, "PUT", message.clone(), &f.joiner).await.0,
        200
    );
    assert_eq!(
        f.send(&slot, "PUT", message.clone(), &candidate("stranger"))
            .await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
    assert_eq!(
        f.send(
            &format!("{PATH}/{number}"),
            "DELETE",
            Value::Null,
            &f.member
        )
        .await,
        (200, json!({"kind":"closed"}))
    );
    assert_eq!(open(&f).await, number);
    assert_eq!(
        f.send(&slot, "PUT", message, &candidate("replacement"))
            .await
            .0,
        200
    );
    for _ in 0..8 {
        open(&f).await;
    }
    assert_eq!(
        f.send(PATH, "POST", json!({}), &f.member).await,
        (429, json!({"error":"RATE_LIMITED"}))
    );
    f.advance(600000);
    assert_eq!(
        f.send(&slot, "GET", Value::Null, &f.member).await,
        (404, json!({"error":"NOT_FOUND"}))
    );
}

#[tokio::test]
async fn missing_approver_rejects_before_nonce_is_recorded() {
    let f = Fixture::new();
    for _ in 0..2 {
        let request = f.request("/v1/pairing/approver", "GET", &[], &f.joiner, |r| {
            r.nonce = [7; 16]
        });
        assert_eq!(f.run(request).await, (404, json!({"error":"NOT_FOUND"})));
    }
}

#[tokio::test]
async fn deleting_missing_or_unowned_mailbox_is_unauthorized() {
    let f = Fixture::new();
    f.fresh();
    let unowned = f
        .options
        .storage
        .open_mailbox(&f.vault, &f.joiner.record.id, f.now())
        .unwrap()
        .unwrap();
    for number in [999, unowned.number] {
        assert_eq!(
            f.send(
                &format!("{PATH}/{number}"),
                "DELETE",
                Value::Null,
                &f.member
            )
            .await,
            (401, json!({"error":"UNAUTHORIZED"}))
        );
    }
}
