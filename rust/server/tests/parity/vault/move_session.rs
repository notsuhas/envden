use crate::support::{VaultFixture, join_swap, token_request};
use envden_core::adapters::storage::*;
use envden_protocol::protocol::*;
use serde_json::json;

#[tokio::test]
async fn move_survives_initiator_loss_and_refunds_original_registrant() {
    for lost_after_commit in [false, true] {
        let o = VaultFixture::new();
        let mut n = VaultFixture::new();
        let f = &o.f;
        assert_eq!(o.initialize().await.0, 200);
        n.f.vault = f.vault;
        let request = token_request(
            &n.f,
            "/v1/move/session",
            "POST",
            &[],
            &f.member,
            TTokenKind::Setup,
            &n.setup,
        );
        assert_eq!(n.f.run(request).await, (200, json!({"kind":"moving"})));
        assert_eq!(
            f.send(
                "/v1/move/freeze",
                "POST",
                serde_json::Value::Null,
                &f.member
            )
            .await,
            (200, json!({"kind":"frozen"}))
        );
        assert_eq!(
            n.f.run(n.f.request(
                "/v1/move/history",
                "POST",
                &encode(&o.create).unwrap(),
                &f.member,
                |_| {}
            ))
            .await,
            (200, json!({"kind":"committed"}))
        );
        assert_eq!(
            f.send(
                "/v1/move/unfreeze",
                "POST",
                serde_json::Value::Null,
                &f.member
            )
            .await
            .0,
            200
        );
        let join = join_swap(&o);
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
        assert_eq!(o.send("/v1/swap", &join, &f.joiner, None).await.0, 200);
        assert_eq!(
            n.f.run(n.f.request(
                "/v1/move/history",
                "POST",
                &encode(&join).unwrap(),
                &f.member,
                |_| {}
            ))
            .await
            .0,
            200
        );
        f.options
            .storage
            .put_device(
                &f.vault,
                &f.joiner.record.id,
                &IStoredDevice {
                    unlocked_until: f.now() + 10000,
                    fresh_until: f.now() + 10000,
                    client_version: "1.0.0".into(),
                    ..Default::default()
                },
            )
            .unwrap();
        let owner = if lost_after_commit {
            &f.member
        } else {
            &f.joiner
        };
        assert_eq!(
            f.send("/v1/move/freeze", "POST", serde_json::Value::Null, owner)
                .await
                .0,
            200
        );
        let receipt = match n
            .f
            .options
            .storage
            .charge(
                &f.vault,
                &TRateBucket::Member {
                    device: f.member.record.id.to_vec(),
                },
                f.now(),
            )
            .unwrap()
        {
            TRateCharge::Charged { receipt } => receipt,
            _ => panic!("charge"),
        };
        n.f.options
            .storage
            .write_state(
                &f.vault,
                &[
                    IStateWrite {
                        kind: TStateKind::MoveSession,
                        key: b"registration".to_vec(),
                        bytes: Some(vec![4; 192]),
                    },
                    IStateWrite {
                        kind: TStateKind::MoveSession,
                        key: b"registration-receipt".to_vec(),
                        bytes: Some(receipt.as_bytes().to_vec()),
                    },
                ],
            )
            .unwrap();
        let moved = sign_object(
            TEntry {
                vault_id: f.vault,
                seq: 3,
                parent: join.header.body.list_head,
                signer: owner.record.id,
                change: TEntryPayload::ServerMoved(IServerMoved {
                    old_pin: server_pin(&f.options.server_keys.public_key).unwrap(),
                    new_pin: server_pin(&n.f.options.server_keys.public_key).unwrap(),
                    new_address: "new.example".into(),
                }),
            },
            &owner.keys.recovery.obj_sk,
            "entry",
        )
        .unwrap();
        let mut header = join.header.body.clone();
        header.op = 10;
        header.list_seq = 3;
        header.list_head = object_hash(&moved, "entry").unwrap();
        let swap = o.next(&join.header, header, vec![moved], owner);
        assert_eq!(
            o.send("/v1/swap", &swap, owner, None).await,
            (200, json!({"kind":"committed"}))
        );
        assert_eq!(
            n.send("/v1/swap", &swap, &f.joiner, None).await,
            (200, json!({"kind":"committed"}))
        );
        assert_eq!(
            n.send("/v1/swap", &swap, &f.joiner, None).await,
            (200, json!({"kind":"retry-of-committed"}))
        );
        assert!(n.f.options.storage.vault(&f.vault).unwrap().unwrap().active);
        assert_eq!(
            n.f.options
                .storage
                .state(&f.vault, TStateKind::MoveSession, b"registration-receipt")
                .unwrap(),
            None
        );
        for _ in 0..5 {
            assert!(matches!(
                n.f.options
                    .storage
                    .charge(
                        &f.vault,
                        &TRateBucket::Member {
                            device: f.member.record.id.to_vec()
                        },
                        f.now()
                    )
                    .unwrap(),
                TRateCharge::Charged { .. }
            ));
        }
    }
}
