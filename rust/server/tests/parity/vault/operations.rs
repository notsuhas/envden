use crate::support::{VaultFixture, prepare_join, wraps};
use envden_core::adapters::storage::{ISessionKey, IStoredDevice, TSessionKind};
use envden_protocol::protocol::*;
use serde_json::json;

#[tokio::test]
async fn operations_require_authorization_and_commit_atomically() {
    for op in [4, 5, 6, 7, 8, 9] {
        let v = VaultFixture::new();
        let f = &v.f;
        assert_eq!(v.initialize().await.0, 200);
        let previous = if matches!(op, 4 | 5) {
            prepare_join(&v).await
        } else {
            v.create.header.clone()
        };
        let recovery = generate_recovery_keys(random_bytes);
        let recovery = IRecoveryRecord {
            id: recovery_id(&recovery.enc_pub, &recovery.obj_pub),
            enc_pub: recovery.enc_pub,
            obj_pub: recovery.obj_pub,
        };
        let change = IEpochChange {
            epoch: 2,
            key_commit: random_bytes(),
            wraps: wraps(&[
                f.member.record.id,
                if matches!(op, 4 | 6) {
                    recovery_id(&v.recovery.enc_pub, &v.recovery.obj_pub)
                } else {
                    recovery.id
                },
            ]),
        };
        let entries = if op == 8 {
            vec![]
        } else {
            vec![
                sign_object(
                    TEntry {
                        vault_id: f.vault,
                        seq: previous.body.list_seq + 1,
                        parent: previous.body.list_head,
                        signer: f.member.record.id,
                        change: if matches!(op, 4 | 5) {
                            TEntryPayload::RemoveDevice(IRemoveDevice {
                                device: f.joiner.record.id,
                                new_recovery: (op == 5).then_some(recovery),
                                change,
                            })
                        } else if op == 6 {
                            TEntryPayload::NewEpoch(INewEpoch { change })
                        } else {
                            TEntryPayload::ReplaceRecovery(IReplaceRecovery { recovery, change })
                        },
                    },
                    &f.member.keys.recovery.obj_sk,
                    "entry",
                )
                .unwrap(),
            ]
        };
        let keyring = (op != 8).then(|| vec![4; 64]);
        let envelope = matches!(op, 5 | 7 | 8 | 9).then(|| vec![5; 64]);
        let mut header = previous.body.clone();
        header.op = op;
        header.epoch = if op == 8 { 1 } else { 2 };
        if let Some(entry) = entries.first() {
            header.list_seq = previous.body.list_seq + 1;
            header.list_head = object_hash(entry, "entry").unwrap();
        }
        if let Some(b) = &keyring {
            header.keyring_hash = h("keyring-blob", b);
        }
        if let Some(b) = &envelope {
            header.envelope_hash = h("envelope-blob", b);
        }
        let mut swap = v.next(&previous, header, entries, &f.member);
        swap.keyring = keyring;
        swap.envelope = envelope;
        swap.sk_pub = (matches!(op, 5 | 7)).then(|| generate_recovery_keys(random_bytes).obj_pub);
        swap.opaque_record = matches!(op, 8 | 9).then(|| vec![6; 192]);
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
            v.send("/v1/swap", &swap, &f.member, None).await,
            if op == 9 {
                (401, json!({"error":"UNAUTHORIZED"}))
            } else {
                (403, json!({"error":"LOCKED"}))
            },
            "{op}"
        );
        let proof = (op == 9).then_some("sk");
        if op != 9 {
            f.fresh();
        }
        if let Some(record) = &swap.opaque_record {
            assert_eq!(
                v.send("/v1/swap", &swap, &f.member, proof).await,
                (401, json!({"error":"UNAUTHORIZED"}))
            );
            f.options
                .storage
                .put_session(
                    &f.vault,
                    &ISessionKey {
                        kind: TSessionKind::Login,
                        device: f.member.record.id.to_vec(),
                        purpose: "registration-record".into(),
                    },
                    record,
                    f.now(),
                )
                .unwrap();
        }
        assert_eq!(
            v.send("/v1/swap", &swap, &f.member, proof).await,
            (200, json!({"kind":"committed"})),
            "{op}"
        );
        assert_eq!(
            v.send("/v1/swap", &swap, &f.member, proof).await,
            (200, json!({"kind":"retry-of-committed"}))
        );
    }
}
