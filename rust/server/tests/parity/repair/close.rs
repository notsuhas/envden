use crate::support::{VaultFixture, record, token_request};
use envden_core::adapters::storage::{IStateWrite, TStateKind};
use envden_protocol::protocol::*;
use envden_server::repair::start_restored;
use serde_json::json;

#[tokio::test]
async fn restored_mode_finishes_repair_including_frozen_move_backups() {
    for frozen in [false, true] {
        let v = VaultFixture::new();
        let f = &v.f;
        assert_eq!(v.initialize().await.0, 200);
        record(f);
        if frozen {
            let mut state = f.options.storage.vault(&f.vault).unwrap().unwrap();
            state.frozen = true;
            f.options
                .storage
                .configure_vault(
                    &f.vault,
                    &state,
                    &[IStateWrite {
                        kind: TStateKind::MoveSession,
                        key: vec![],
                        bytes: Some(f.member.record.id.to_vec()),
                    }],
                    None,
                )
                .unwrap();
        }
        let first = start_restored(&f.options)
            .unwrap()
            .into_iter()
            .find(|n| n.vault_id == f.vault)
            .unwrap()
            .token
            .unwrap();
        let point = f
            .options
            .storage
            .vault(&f.vault)
            .unwrap()
            .unwrap()
            .restored
            .unwrap()
            .restored_head;
        let second = start_restored(&f.options)
            .unwrap()
            .into_iter()
            .find(|n| n.vault_id == f.vault)
            .unwrap()
            .token
            .unwrap();
        assert_eq!(
            f.options
                .storage
                .vault(&f.vault)
                .unwrap()
                .unwrap()
                .restored
                .unwrap()
                .restored_head,
            point
        );
        assert_eq!(
            f.options
                .storage
                .state(&f.vault, TStateKind::MoveSession, &[])
                .unwrap(),
            None
        );
        assert_eq!(
            f.send("/v1/head", "GET", serde_json::Value::Null, &f.member)
                .await,
            (409, json!({"error":"RESTORED_MODE"}))
        );
        let old = token_key(
            TTokenKind::Repair,
            &decode_token(TTokenKind::Repair, &first).unwrap().0,
        );
        let secret = decode_token(TTokenKind::Repair, &second).unwrap().0;
        let repair = token_key(TTokenKind::Repair, &secret);
        assert_eq!(
            f.run(token_request(
                f,
                "/v1/head",
                "GET",
                &[],
                &f.member,
                TTokenKind::Repair,
                &old
            ))
            .await,
            (409, json!({"error":"RESTORED_MODE"}))
        );
        assert_eq!(
            f.run(token_request(
                f,
                "/v1/head",
                "GET",
                &[],
                &f.member,
                TTokenKind::Repair,
                &repair
            ))
            .await
            .0,
            200
        );
        assert_eq!(
            f.run(token_request(
                f,
                "/v1/pairing/mailboxes",
                "POST",
                &[],
                &f.member,
                TTokenKind::Repair,
                &repair
            ))
            .await,
            (409, json!({"error":"RESTORED_MODE"}))
        );
        let entry = sign_object(
            TEntry {
                vault_id: f.vault,
                seq: 2,
                parent: v.create.header.body.list_head,
                signer: f.member.record.id,
                change: TEntryPayload::RepairDone(IRepairDone {
                    repair_id: h("repair-id", &secret),
                    restored_head: fixed(&point).unwrap(),
                }),
            },
            &f.member.keys.recovery.obj_sk,
            "entry",
        )
        .unwrap();
        let mut header = v.create.header.body.clone();
        header.op = 12;
        header.list_seq = 2;
        header.list_head = object_hash(&entry, "entry").unwrap();
        let swap = v.next(&v.create.header, header, vec![entry], &f.member);
        let bytes = encode(&swap).unwrap();
        assert_eq!(
            f.run(token_request(
                f,
                "/v1/swap",
                "POST",
                &bytes,
                &f.member,
                TTokenKind::Repair,
                &repair
            ))
            .await,
            (401, json!({"error":"UNAUTHORIZED"}))
        );
        assert_eq!(
            crate::repair_finish::finish_login(f, &repair, &swap).await,
            (200, json!({"kind":"committed"}))
        );
        assert_eq!(
            f.run(token_request(
                f,
                "/v1/swap",
                "POST",
                &bytes,
                &f.member,
                TTokenKind::Repair,
                &repair
            ))
            .await,
            (200, json!({"kind":"retry-of-committed"}))
        );
        assert!(
            f.options
                .storage
                .vault(&f.vault)
                .unwrap()
                .unwrap()
                .restored
                .is_none()
        );
        assert!(
            f.options
                .storage
                .device(&f.vault, &f.member.record.id)
                .unwrap()
                .unwrap()
                .fresh_until
                > f.now()
        );
        assert_eq!(
            f.run(token_request(
                f,
                "/v1/repair/status",
                "GET",
                &[],
                &f.member,
                TTokenKind::Repair,
                &repair
            ))
            .await,
            (401, json!({"error":"UNAUTHORIZED"}))
        );
    }
}
