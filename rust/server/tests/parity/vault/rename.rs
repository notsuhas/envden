use crate::support::{VaultFixture, prepare_join};
use envden_core::adapters::storage::IStoredDevice;
use envden_protocol::protocol::*;
use serde_json::json;

#[tokio::test]
async fn rename_requires_own_signature_and_only_unlocked_session() {
    let v = VaultFixture::new();
    let f = &v.f;
    assert_eq!(v.initialize().await.0, 200);
    let previous = prepare_join(&v).await;
    for (entry_who, header_who) in [(&f.joiner, &f.joiner), (&f.member, &f.joiner)] {
        let entry = sign_object(
            TEntry {
                vault_id: f.vault,
                seq: 3,
                parent: previous.body.list_head,
                signer: entry_who.record.id,
                change: TEntryPayload::RenameDevice(IRenameDevice {
                    device: f.member.record.id,
                    name: "laptop".into(),
                }),
            },
            &entry_who.keys.recovery.obj_sk,
            "entry",
        )
        .unwrap();
        let mut header = previous.body.clone();
        header.op = 13;
        header.list_seq = 3;
        header.list_head = object_hash(&entry, "entry").unwrap();
        let swap = v.next(&previous, header, vec![entry], header_who);
        assert_eq!(
            v.send("/v1/swap", &swap, header_who, None).await,
            (400, json!({"error":"INVALID_DATA"}))
        );
    }
    let entry = sign_object(
        TEntry {
            vault_id: f.vault,
            seq: 3,
            parent: previous.body.list_head,
            signer: f.member.record.id,
            change: TEntryPayload::RenameDevice(IRenameDevice {
                device: f.member.record.id,
                name: "laptop".into(),
            }),
        },
        &f.member.keys.recovery.obj_sk,
        "entry",
    )
    .unwrap();
    let mut header = previous.body.clone();
    header.op = 13;
    header.list_seq = 3;
    header.list_head = object_hash(&entry, "entry").unwrap();
    let swap = v.next(&previous, header, vec![entry], &f.member);
    let mut device = IStoredDevice {
        client_version: "1.0.0".into(),
        ..Default::default()
    };
    f.options
        .storage
        .put_device(&f.vault, &f.member.record.id, &device)
        .unwrap();
    assert_eq!(
        v.send("/v1/swap", &swap, &f.member, None).await,
        (403, json!({"error":"LOCKED"}))
    );
    device.unlocked_until = f.now() + 10000;
    f.options
        .storage
        .put_device(&f.vault, &f.member.record.id, &device)
        .unwrap();
    assert_eq!(
        v.send("/v1/swap", &swap, &f.member, None).await,
        (200, json!({"kind":"committed"}))
    );
}
