use super::VaultFixture;
use envden_core::adapters::storage::{ISessionKey, TSessionKind};
use envden_protocol::protocol::*;
use serde_json::json;

pub fn join_swap(v: &VaultFixture) -> ISwap {
    let f = &v.f;
    let entry = sign_object(
        TEntry {
            vault_id: f.vault,
            seq: 2,
            parent: v.create.header.body.list_head,
            change: TEntryPayload::AddDevice(IAddDevice {
                device: f.joiner.record.clone(),
                wrap: IWrap {
                    recipient: f.joiner.record.id,
                    enc: random_bytes(),
                    ct: vec![1; 48],
                },
            }),
            signer: recovery_id(&v.recovery.enc_pub, &v.recovery.obj_pub),
        },
        &v.recovery.obj_sk,
        "entry",
    )
    .unwrap();
    let mut header = v.create.header.body.clone();
    header.op = 3;
    header.list_seq = 2;
    header.list_head = object_hash(&entry, "entry").unwrap();
    v.next(&v.create.header, header, vec![entry], &f.joiner)
}

pub async fn prepare_join(v: &VaultFixture) -> ISigned<IManifestHeader> {
    let f = &v.f;
    let swap = join_swap(v);
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
        v.send("/v1/swap", &swap, &f.joiner, None).await,
        (200, json!({"kind":"committed"}))
    );
    swap.header
}
