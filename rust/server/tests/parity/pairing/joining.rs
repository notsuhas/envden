use crate::support::VaultFixture;
use envden_protocol::protocol::*;
use envden_server::http::encoding::text;
use serde_json::{Value, json};

#[tokio::test]
async fn joiner_can_pair_before_learning_vault_and_atomic_commit_consumes_grant() {
    let v = VaultFixture::new();
    let f = &v.f;
    assert_eq!(v.initialize().await.0, 200);
    let (status, box_) = f
        .send("/v1/pairing/mailboxes", "POST", json!({}), &f.member)
        .await;
    assert_eq!(status, 200);
    let number = box_["number"].as_u64().unwrap();
    let base = format!("/v1/pairing/mailboxes/{number}");
    for (slot, size, owner) in [
        ("KE1", 96, false),
        ("KE2", 320, true),
        ("KE3", 64, false),
        ("PairJoiner", 64, false),
    ] {
        let bytes = serde_json::to_vec(&json!({"message":text(&vec![1;size])})).unwrap();
        let who = if owner { &f.member } else { &f.joiner };
        let request = f.request(&format!("{base}/{slot}"), "PUT", &bytes, who, |r| {
            if !owner {
                r.vault_id = [0; 32];
            }
        });
        assert_eq!(f.run(request).await.0, 200);
    }
    let entry = sign_object(
        TEntry {
            vault_id: f.vault,
            seq: 2,
            parent: v.create.header.body.list_head,
            signer: f.member.record.id,
            change: TEntryPayload::AddDevice(IAddDevice {
                device: f.joiner.record.clone(),
                wrap: IWrap {
                    recipient: f.joiner.record.id,
                    enc: random_bytes(),
                    ct: vec![1; 48],
                },
            }),
        },
        &f.member.keys.recovery.obj_sk,
        "entry",
    )
    .unwrap();
    let mut header = v.create.header.body.clone();
    header.op = 2;
    header.list_seq = 2;
    header.list_head = object_hash(&entry, "entry").unwrap();
    let mut swap = v.next(&v.create.header, header, vec![entry], &f.member);
    swap.approver = Some(vec![9; 64]);
    assert_eq!(
        v.send(
            &format!("/v1/swap?mailbox={number}"),
            &swap,
            &f.member,
            None
        )
        .await,
        (200, json!({"kind":"committed"}))
    );
    assert_eq!(
        f.options
            .storage
            .mailbox(&f.vault, number, f.now())
            .unwrap(),
        None
    );
    let request = f.request("/v1/pairing/approver", "GET", &[], &f.joiner, |r| {
        r.vault_id = [0; 32]
    });
    assert_eq!(
        f.run(request).await,
        (200, json!({"message":text(&[9;64])}))
    );
    assert_eq!(
        f.send(&format!("{base}/KE1"), "GET", Value::Null, &f.member)
            .await,
        (404, json!({"error":"NOT_FOUND"}))
    );
    for _ in 0..2 {
        assert_eq!(
            f.send("/v1/pairing/approver", "GET", Value::Null, &f.joiner)
                .await,
            (200, json!({"message":text(&[9;64])}))
        );
    }
    assert_eq!(
        f.send(
            "/v1/pairing/approver",
            "GET",
            Value::Null,
            &crate::support::candidate("other")
        )
        .await,
        (404, json!({"error":"NOT_FOUND"}))
    );
    f.advance(86400000);
    assert_eq!(
        f.send("/v1/pairing/approver", "GET", Value::Null, &f.joiner)
            .await,
        (404, json!({"error":"NOT_FOUND"}))
    );
}

#[tokio::test]
async fn conflicting_filled_slot_closes_before_opaque_length_validation() {
    let v = VaultFixture::new();
    let f = &v.f;
    assert_eq!(v.initialize().await.0, 200);
    let (_, box_) = f
        .send("/v1/pairing/mailboxes", "POST", json!({}), &f.member)
        .await;
    let path = format!(
        "/v1/pairing/mailboxes/{}/KE1",
        box_["number"].as_u64().unwrap()
    );
    assert_eq!(
        f.send(&path, "PUT", json!({"message":text(&[1;96])}), &f.joiner)
            .await
            .0,
        200
    );
    assert_eq!(
        f.send(&path, "PUT", json!({"message":"AA"}), &f.joiner)
            .await,
        (409, json!({"error":"CONFLICT"}))
    );
    assert_eq!(
        f.send(&path, "GET", Value::Null, &f.member).await,
        (404, json!({"error":"NOT_FOUND"}))
    );
}
