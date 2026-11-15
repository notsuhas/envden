use crate::support::{VaultFixture, prepare_join, token_request};
use envden_protocol::protocol::*;
use envden_server::repair::start_restored;
use serde_json::json;

pub async fn reported_repair() -> (VaultFixture, ISwap, [u8; 32], [u8; 32], [u8; 32]) {
    let v = VaultFixture::new();
    let f = &v.f;
    assert_eq!(v.initialize().await.0, 200);
    let join = prepare_join(&v).await;
    let token = start_restored(&f.options)
        .unwrap()
        .into_iter()
        .find(|n| n.vault_id == f.vault)
        .unwrap()
        .token
        .unwrap();
    let secret = decode_token(TTokenKind::Repair, &token).unwrap().0;
    let repair = token_key(TTokenKind::Repair, &secret);
    let repair_id = h("repair-id", &secret);
    let files = IFiles {
        entries: vec![IFileEntry {
            file_id: random_bytes(),
            version: 1,
            epoch: 1,
            state: 1,
            blob_hash: random_bytes(),
            name: vec![3; 32],
        }],
    };
    let mut header = join.body.clone();
    header.op = 1;
    header.files_hash = h("files", &encode(&files).unwrap());
    let mut push = v.next(&join, header, vec![], &f.member);
    push.files = Some(files);
    assert_eq!(
        f.run(token_request(
            f,
            "/v1/repair/history",
            "POST",
            &encode(&push).unwrap(),
            &f.member,
            TTokenKind::Repair,
            &repair
        ))
        .await,
        (200, json!({"kind":"committed"}))
    );
    for who in [&f.member, &f.joiner] {
        let report = sign_object(
            IRepairReport {
                vault_id: f.vault,
                repair_id,
                head: object_hash(&push.header, "manifest").unwrap(),
                blobs: vec![],
                signer: who.record.id,
            },
            &who.keys.recovery.obj_sk,
            "repair-report",
        )
        .unwrap();
        assert_eq!(
            f.run(token_request(
                f,
                "/v1/repair/report",
                "PUT",
                &encode(&report).unwrap(),
                who,
                TTokenKind::Repair,
                &repair
            ))
            .await,
            (200, json!({"kind":"stored"}))
        );
    }

    (
        v,
        push,
        object_hash(&join, "manifest").unwrap(),
        repair,
        repair_id,
    )
}
