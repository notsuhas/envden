use crate::support::{Fixture, candidate};
use envden_server::http::encoding::text;
use serde_json::{Value, json};

const PATH: &str = "/v1/pairing/mailboxes";

async fn open(f: &Fixture) -> u64 {
    let (status, body) = f.send(PATH, "POST", json!({}), &f.member).await;
    assert_eq!(status, 200);
    body["number"].as_u64().unwrap()
}

#[tokio::test]
async fn rejected_writers_do_not_consume_bound_mailbox_budget() {
    let f = Fixture::new();
    f.fresh();
    let number = open(&f).await;
    let slot = format!("{PATH}/{number}/KE1");
    let body = json!({"message":text(&[1;96])});
    assert_eq!(f.send(&slot, "PUT", body.clone(), &f.joiner).await.0, 200);
    for _ in 0..20 {
        assert_eq!(
            f.send(&slot, "PUT", body.clone(), &candidate("stranger"))
                .await,
            (401, json!({"error":"UNAUTHORIZED"}))
        );
    }
    assert_eq!(
        f.send(&slot, "PUT", body.clone(), &candidate("stranger"))
            .await,
        (429, json!({"error":"RATE_LIMITED"}))
    );
    assert_eq!(f.send(&slot, "PUT", body, &f.joiner).await.0, 200);
    assert_eq!(
        f.options
            .storage
            .mailbox(&f.vault, number, f.now())
            .unwrap()
            .unwrap()
            .slots[&envden_core::adapters::storage::TMailboxSlot::KE1],
        vec![1; 96]
    );
}

#[tokio::test]
async fn new_mailbox_has_fresh_aggregate_bucket() {
    let f = Fixture::new();
    f.fresh();
    let number = open(&f).await;
    let slot = format!("{PATH}/{number}/KE1");
    let body = json!({"message":text(&[1;96])});
    for _ in 0..20 {
        assert_eq!(f.send(&slot, "PUT", body.clone(), &f.joiner).await.0, 200);
    }
    assert_eq!(
        f.send(&slot, "PUT", body.clone(), &f.joiner).await,
        (429, json!({"error":"RATE_LIMITED"}))
    );
    assert_eq!(
        f.send(
            &format!("{PATH}/{number}"),
            "DELETE",
            Value::Null,
            &f.member
        )
        .await
        .0,
        200
    );
    f.advance(1);
    assert_eq!(open(&f).await, number);
    assert_eq!(
        f.send(&slot, "PUT", body, &candidate("replacement"))
            .await
            .0,
        200
    );
}
