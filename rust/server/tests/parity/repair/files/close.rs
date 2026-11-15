use crate::{
    repair_files_changes::drop_and_accept_lost, repair_files_setup::reported_repair,
    support::token_request,
};
use envden_core::adapters::storage::{ISessionKey, TSessionKind, TStateKind};
use envden_protocol::protocol::*;
use serde_json::json;

#[tokio::test]
async fn repair_preserves_device_reports_drops_members_and_consumes_reports_on_close() {
    let (v, push, point, repair, repair_id) = reported_repair().await;
    let f = &v.f;
    let fix = drop_and_accept_lost(&v, &push, &repair).await;
    let (status, reports) = f
        .run(token_request(
            f,
            "/v1/repair/reports",
            "GET",
            &[],
            &f.member,
            TTokenKind::Repair,
            &repair,
        ))
        .await;
    assert_eq!(status, 200);
    assert_eq!(reports["objects"].as_array().unwrap().len(), 2);
    let done = sign_object(
        TEntry {
            vault_id: f.vault,
            seq: 4,
            parent: fix.header.body.list_head,
            signer: f.member.record.id,
            change: TEntryPayload::RepairDone(IRepairDone {
                repair_id,
                restored_head: point,
            }),
        },
        &f.member.keys.recovery.obj_sk,
        "entry",
    )
    .unwrap();
    let mut header = fix.header.body.clone();
    header.op = 12;
    header.list_seq = 4;
    header.list_head = object_hash(&done, "entry").unwrap();
    let close = v.next(&fix.header, header, vec![done], &f.member);
    f.options
        .storage
        .put_session(
            &f.vault,
            &ISessionKey {
                kind: TSessionKind::Login,
                device: f.member.record.id.to_vec(),
                purpose: "repair-finish".into(),
            },
            &repair,
            f.now(),
        )
        .unwrap();
    assert_eq!(
        f.run(token_request(
            f,
            "/v1/swap",
            "POST",
            &encode(&close).unwrap(),
            &f.member,
            TTokenKind::Repair,
            &repair
        ))
        .await,
        (200, json!({"kind":"committed"}))
    );
    assert!(
        f.options
            .storage
            .states(&f.vault, TStateKind::RepairReport)
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        f.send(
            "/v1/settings/unlock-period",
            "GET",
            serde_json::Value::Null,
            &f.joiner
        )
        .await,
        (403, json!({"error":"NOT_MEMBER"}))
    );
}
