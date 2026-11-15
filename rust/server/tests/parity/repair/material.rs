use crate::support::VaultFixture;
use envden_core::adapters::storage::IRestoredVault;
use envden_protocol::protocol::*;
use envden_server::http::encoding::{binary, text};
use serde_json::json;

#[tokio::test]
async fn repair_material_and_reads_require_membership_and_named_hashes() {
    let v = VaultFixture::new();
    let f = &v.f;
    assert_eq!(v.initialize().await.0, 200);
    let repair = random_bytes::<32>();
    let mut state = f.options.storage.vault(&f.vault).unwrap().unwrap();
    state.restored = Some(IRestoredVault {
        repair_token_hash: repair.to_vec(),
        restored_head: f.options.storage.head(&f.vault).unwrap().unwrap(),
        finish_progress: None,
    });
    f.options
        .storage
        .configure_vault(&f.vault, &state, &[], None)
        .unwrap();
    for (kind, member, read, status, code) in [
        ("files", false, false, 403, "NOT_MEMBER"),
        ("keyring", false, false, 403, "NOT_MEMBER"),
        ("head", false, true, 403, "NOT_MEMBER"),
        ("head", true, true, 200, ""),
        ("keyring", true, false, 400, "INVALID_DATA"),
        ("envelope", true, false, 400, "INVALID_DATA"),
        ("skPub", true, false, 400, "INVALID_INPUT"),
    ] {
        let bytes = [3; 32];
        let hash = match kind {
            "keyring" => h("keyring-blob", &bytes),
            "envelope" => h("envelope-blob", &bytes),
            _ => bytes,
        };
        let path = if read {
            "/v1/head".to_owned()
        } else {
            format!("/v1/repair/material/{kind}/{}", text(&hash))
        };
        let who = if member { &f.member } else { &f.joiner };
        let mut req = f.request(
            &path,
            if read { "GET" } else { "PUT" },
            if read { &[] } else { &bytes },
            who,
            |_| {},
        );
        let r: IRequest =
            decode(&binary(req.headers()["envden-request"].to_str().unwrap(), None).unwrap())
                .unwrap();
        req.headers_mut().insert(
            "envden-proof",
            text(&token_proof(TTokenKind::Repair, &repair, &r).unwrap())
                .parse()
                .unwrap(),
        );
        let result = f.run(req).await;
        assert_eq!(result.0, status, "{kind} member={member}");
        if status != 200 {
            assert_eq!(result.1, json!({"error":code}));
        }
    }
}

#[tokio::test]
async fn large_signed_repair_report_accepts_the_maximum_list() {
    let v = VaultFixture::new();
    let f = &v.f;
    assert_eq!(v.initialize().await.0, 200);
    let repair = random_bytes::<32>();
    let repair_id = random_bytes::<32>();
    let head = f.options.storage.head(&f.vault).unwrap().unwrap();
    let mut state = f.options.storage.vault(&f.vault).unwrap().unwrap();
    state.restored = Some(IRestoredVault {
        repair_token_hash: repair.to_vec(),
        restored_head: head.clone(),
        finish_progress: Some(repair_id.to_vec()),
    });
    f.options
        .storage
        .configure_vault(&f.vault, &state, &[], None)
        .unwrap();
    let blobs = (0_u32..100000)
        .map(|i| {
            let mut hash = [0; 32];
            hash[28..].copy_from_slice(&i.to_be_bytes());
            hash
        })
        .collect();
    let report = sign_object(
        IRepairReport {
            vault_id: f.vault,
            repair_id,
            head: fixed(&head).unwrap(),
            blobs,
            signer: f.member.record.id,
        },
        &f.member.keys.recovery.obj_sk,
        "repair-report",
    )
    .unwrap();
    let request = crate::support::token_request(
        f,
        "/v1/repair/report",
        "PUT",
        &encode(&report).unwrap(),
        &f.member,
        TTokenKind::Repair,
        &repair,
    );
    assert_eq!(f.run(request).await, (200, json!({"kind":"stored"})));
}
