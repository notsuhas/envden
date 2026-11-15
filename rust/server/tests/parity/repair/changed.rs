use crate::support::{VaultFixture, token_request, wraps};
use envden_protocol::protocol::*;
use envden_server::repair::start_restored;
use serde_json::json;

pub async fn changed_repair() -> (VaultFixture, ISwap, [u8; 32]) {
    let v = VaultFixture::new();
    let f = &v.f;
    assert_eq!(v.initialize().await.0, 200);
    let token = start_restored(&f.options)
        .unwrap()
        .into_iter()
        .find(|n| n.vault_id == f.vault)
        .unwrap()
        .token
        .unwrap();
    let secret = decode_token(TTokenKind::Repair, &token).unwrap().0;
    let repair = token_key(TTokenKind::Repair, &secret);
    let keys = generate_recovery_keys(random_bytes);
    let recovery = IRecoveryRecord {
        id: recovery_id(&keys.enc_pub, &keys.obj_pub),
        enc_pub: keys.enc_pub,
        obj_pub: keys.obj_pub,
    };
    let entry = sign_object(
        TEntry {
            vault_id: f.vault,
            seq: 2,
            parent: v.create.header.body.list_head,
            signer: f.member.record.id,
            change: TEntryPayload::ReplaceRecovery(IReplaceRecovery {
                recovery: recovery.clone(),
                change: IEpochChange {
                    epoch: 2,
                    key_commit: random_bytes(),
                    wraps: wraps(&[f.member.record.id, recovery.id]),
                },
            }),
        },
        &f.member.keys.recovery.obj_sk,
        "entry",
    )
    .unwrap();
    let envelope = vec![5; 64];
    let keyring = vec![6; 64];
    let mut header = v.create.header.body.clone();
    header.op = 7;
    header.list_seq = 2;
    header.list_head = object_hash(&entry, "entry").unwrap();
    header.epoch = 2;
    header.keyring_hash = h("keyring-blob", &keyring);
    header.envelope_hash = h("envelope-blob", &envelope);
    let mut kit = v.next(&v.create.header, header, vec![entry], &f.member);
    kit.envelope = Some(envelope);
    kit.keyring = Some(keyring);
    kit.sk_pub = Some(generate_recovery_keys(random_bytes).obj_pub);
    assert_eq!(
        f.run(token_request(
            f,
            "/v1/repair/history",
            "POST",
            &encode(&kit).unwrap(),
            &f.member,
            TTokenKind::Repair,
            &repair
        ))
        .await,
        (200, json!({"kind":"committed"}))
    );
    let envelope = vec![7; 64];
    let mut header = kit.header.body.clone();
    header.op = 8;
    header.envelope_hash = h("envelope-blob", &envelope);
    let mut password = v.next(&kit.header, header, vec![], &f.member);
    password.envelope = Some(envelope);
    assert_eq!(
        f.run(token_request(
            f,
            "/v1/repair/history",
            "POST",
            &encode(&password).unwrap(),
            &f.member,
            TTokenKind::Repair,
            &repair
        ))
        .await,
        (200, json!({"kind":"committed"}))
    );
    let done = sign_object(
        TEntry {
            vault_id: f.vault,
            seq: 3,
            parent: kit.header.body.list_head,
            signer: f.member.record.id,
            change: TEntryPayload::RepairDone(IRepairDone {
                repair_id: h("repair-id", &secret),
                restored_head: object_hash(&v.create.header, "manifest").unwrap(),
            }),
        },
        &f.member.keys.recovery.obj_sk,
        "entry",
    )
    .unwrap();
    let mut header = password.header.body.clone();
    header.op = 12;
    header.list_seq = 3;
    header.list_head = object_hash(&done, "entry").unwrap();
    let close = v.next(&password.header, header, vec![done], &f.member);

    (v, close, repair)
}
