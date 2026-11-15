use crate::support::VaultFixture;
use envden_core::adapters::storage::{ISessionKey, IStoredDevice, TSessionKind};
use envden_protocol::protocol::*;
use envden_server::http::encoding::{binary, text};
use serde_json::{Value, json};

#[tokio::test]
async fn creation_blob_upload_push_head_race_and_digest_retry() {
    let v = VaultFixture::new();
    let f = &v.f;
    assert_eq!(v.initialize().await, (200, json!({"kind":"committed"})));
    assert_eq!(
        v.initialize().await,
        (200, json!({"kind":"retry-of-committed"}))
    );
    assert_eq!(f.options.storage.setup_token().unwrap(), None);
    let bytes = vec![5; 64];
    let hash = h("blob", &bytes);
    let files = IFiles {
        entries: vec![IFileEntry {
            file_id: random_bytes(),
            version: 1,
            epoch: 1,
            state: 1,
            blob_hash: hash,
            name: vec![3; 32],
        }],
    };
    let mut header = v.create.header.body.clone();
    header.op = 1;
    header.files_hash = h("files", &encode(&files).unwrap());
    let mut swap = v.next(&v.create.header, header, vec![], &f.member);
    swap.files = Some(files);
    assert_eq!(
        v.send("/v1/swap", &swap, &f.member, None).await,
        (400, json!({"error":"INVALID_DATA"}))
    );
    let path = format!("/v1/blobs/{}", base32(&hash));
    assert_eq!(
        f.run(f.request(&path, "PUT", &bytes, &f.member, |_| {}))
            .await,
        (400, json!({"error":"INVALID_INPUT"}))
    );
    let path = format!("/v1/blobs/{}", text(&hash));
    assert_eq!(
        f.run(f.request(&path, "PUT", &bytes, &f.member, |_| {}))
            .await
            .0,
        200
    );
    assert_eq!(
        v.send("/v1/swap", &swap, &f.member, None).await,
        (200, json!({"kind":"committed"}))
    );
    let mut race = swap.clone();
    race.header.body.created_at = 2;
    race.header =
        sign_object(race.header.body, &f.member.keys.recovery.obj_sk, "manifest").unwrap();
    assert_eq!(
        v.send("/v1/swap", &race, &f.member, None).await,
        (
            409,
            json!({"kind":"head-moved","head":text(&object_hash(&swap.header,"manifest").unwrap())})
        )
    );
    assert_eq!(
        v.send("/v1/swap", &swap, &f.member, None).await,
        (200, json!({"kind":"retry-of-committed"}))
    );
}

#[tokio::test]
async fn reads_enforce_unlock_ticket_and_secret_key_proof() {
    let v = VaultFixture::new();
    let f = &v.f;
    assert_eq!(v.initialize().await.0, 200);
    f.options
        .storage
        .put_device(
            &f.vault,
            &f.member.record.id,
            &IStoredDevice {
                client_version: "1.0.0".into(),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(
        f.send("/v1/head", "GET", Value::Null, &f.member).await,
        (403, json!({"error":"LOCKED"}))
    );
    for (path, expected) in [
        ("/v1/head", encode(&v.create.header).unwrap()),
        ("/v1/envelope", v.create.envelope.clone().unwrap()),
    ] {
        let mut request = f.request(path, "GET", &[], &f.member, |_| {});
        let r: IRequest =
            decode(&binary(request.headers()["envden-request"].to_str().unwrap(), None).unwrap())
                .unwrap();
        request.headers_mut().insert(
            "envden-proof",
            text(&sign(&v.sk.obj_sk, "sk-proof", &encode(&r).unwrap()))
                .parse()
                .unwrap(),
        );
        assert_eq!(f.run(request).await, (200, json!(expected)));
    }
    assert_eq!(
        f.send("/v1/head", "GET", Value::Null, &f.joiner).await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
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
    assert_eq!(
        f.send("/v1/head", "GET", Value::Null, &f.joiner).await,
        (200, json!(encode(&v.create.header).unwrap()))
    );
    let path = format!("/v1/blobs/{}", text(&random_bytes::<32>()));
    assert_eq!(
        f.send(&path, "GET", Value::Null, &f.joiner).await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
}
