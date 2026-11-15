use crate::support::VaultFixture;
use envden_core::adapters::storage::{ISessionKey, TSessionKind};
use envden_protocol::protocol::*;
use serde_json::json;

#[tokio::test]
async fn joins_assign_unlock_without_fresh_and_consume_authority() {
    for op in [2, 3] {
        let v = VaultFixture::new();
        let f = &v.f;
        assert_eq!(v.initialize().await, (200, json!({"kind":"committed"})));
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
                signer: if op == 2 {
                    f.member.record.id
                } else {
                    recovery_id(&v.recovery.enc_pub, &v.recovery.obj_pub)
                },
            },
            if op == 2 {
                &f.member.keys.recovery.obj_sk
            } else {
                &v.recovery.obj_sk
            },
            "entry",
        )
        .unwrap();
        let mut header = v.create.header.body.clone();
        header.op = op;
        header.list_seq = 2;
        header.list_head = object_hash(&entry, "entry").unwrap();
        let who = if op == 2 { &f.member } else { &f.joiner };
        let mut swap = v.next(&v.create.header, header, vec![entry], who);
        if op == 2 {
            swap.approver = Some(vec![1; 64]);
        }
        assert_eq!(
            v.send("/v1/swap", &swap, who, None).await,
            (401, json!({"error":"UNAUTHORIZED"}))
        );
        let mut path = "/v1/swap".to_string();
        if op == 3 {
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
        } else {
            let mailbox = f
                .options
                .storage
                .open_mailbox(&f.vault, &f.member.record.id, f.now())
                .unwrap()
                .unwrap();
            use envden_core::adapters::storage::{IStateWrite, TMailboxSlot, TStateKind};
            for (slot, length) in [
                (TMailboxSlot::KE1, 96),
                (TMailboxSlot::KE2, 320),
                (TMailboxSlot::KE3, 64),
                (TMailboxSlot::PairJoiner, 64),
            ] {
                f.options
                    .storage
                    .write_mailbox(&f.vault, mailbox.number, slot, &vec![1; length], f.now())
                    .unwrap();
            }
            f.options
                .storage
                .write_state(
                    &f.vault,
                    &[IStateWrite {
                        kind: TStateKind::MailboxJoiner,
                        key: vec![(mailbox.number >> 8) as u8, mailbox.number as u8],
                        bytes: Some(f.joiner.record.id.to_vec()),
                    }],
                )
                .unwrap();
            path += &format!("?mailbox={}", mailbox.number);
        }
        assert_eq!(
            v.send(&path, &swap, who, None).await,
            (200, json!({"kind":"committed"}))
        );
        let device = f
            .options
            .storage
            .device(&f.vault, &f.joiner.record.id)
            .unwrap()
            .unwrap();
        assert_eq!(device.fresh_until, 0);
        assert!(device.unlocked_until > f.now());
    }
}
