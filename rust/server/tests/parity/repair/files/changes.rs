use crate::support::{VaultFixture, token_request, wraps};
use envden_protocol::protocol::*;
use serde_json::json;

pub async fn drop_and_accept_lost(v: &VaultFixture, push: &ISwap, repair: &[u8; 32]) -> ISwap {
    let f = &v.f;
    let recovery = recovery_id(&v.recovery.enc_pub, &v.recovery.obj_pub);
    let entry = sign_object(
        TEntry {
            vault_id: f.vault,
            seq: 3,
            parent: push.header.body.list_head,
            signer: f.member.record.id,
            change: TEntryPayload::RemoveDevice(IRemoveDevice {
                device: f.joiner.record.id,
                new_recovery: None,
                change: IEpochChange {
                    epoch: 2,
                    key_commit: random_bytes(),
                    wraps: wraps(&[f.member.record.id, recovery]),
                },
            }),
        },
        &f.member.keys.recovery.obj_sk,
        "entry",
    )
    .unwrap();
    let keyring = vec![7; 64];
    let mut header = push.header.body.clone();
    header.op = 4;
    header.epoch = 2;
    header.list_seq = 3;
    header.list_head = object_hash(&entry, "entry").unwrap();
    header.keyring_hash = h("keyring-blob", &keyring);
    let mut drop = v.next(&push.header, header, vec![entry], &f.member);
    drop.keyring = Some(keyring);
    assert_eq!(
        f.run(token_request(
            f,
            "/v1/swap",
            "POST",
            &encode(&drop).unwrap(),
            &f.member,
            TTokenKind::Repair,
            repair
        ))
        .await,
        (200, json!({"kind":"committed"}))
    );
    let mut lost = push.files.clone().unwrap();
    let entry = &mut lost.entries[0];
    entry.version = 2;
    entry.epoch = 2;
    entry.state = 4;
    entry.blob_hash = [0; 32];
    entry.name = vec![8; 32];
    let mut header = drop.header.body.clone();
    header.op = 11;
    header.files_hash = h("files", &encode(&lost).unwrap());
    let mut fix = v.next(&drop.header, header, vec![], &f.member);
    fix.files = Some(lost);
    assert_eq!(
        f.run(token_request(
            f,
            "/v1/swap",
            "POST",
            &encode(&fix).unwrap(),
            &f.member,
            TTokenKind::Repair,
            repair
        ))
        .await,
        (200, json!({"kind":"committed"}))
    );

    fix
}
