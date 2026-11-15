use crate::support::{Fixture, candidate};
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use base64::{
    Engine,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use envden_core::adapters::storage::*;
use envden_protocol::protocol::*;
use envden_server::{create_app, status::IStatusState};
use serde_json::json;
use std::sync::{Arc, Mutex};
use tower::ServiceExt;

#[tokio::test]
async fn status_does_not_expose_vault_device_or_file_data() {
    let f = Fixture::new();
    let device = candidate("canary-laptop-5521");
    let recovery = generate_recovery_keys(random_bytes);
    let genesis = sign_object(
        TEntry {
            vault_id: [0; 32],
            seq: 0,
            parent: [0; 32],
            signer: device.record.id,
            change: TEntryPayload::Genesis(IGenesis {
                server_pin: server_pin(&f.options.server_keys.public_key).unwrap(),
                device: device.record.clone(),
                recovery: IRecoveryRecord {
                    id: recovery_id(&recovery.enc_pub, &recovery.obj_pub),
                    enc_pub: recovery.enc_pub,
                    obj_pub: recovery.obj_pub,
                },
                vault_nonce: random_bytes(),
                created_at: 1,
            }),
        },
        &device.keys.recovery.obj_sk,
        "entry",
    )
    .unwrap();
    let id = object_hash(&genesis, "entry").unwrap();
    let file = random_bytes::<16>();
    let blob = vec![9; 4096];
    let hash = h("blob", &blob);
    let list = [file.as_slice(), &hash].concat();
    f.options
        .storage
        .configure_vault(
            &id,
            &IStoredVault {
                active: true,
                ..Default::default()
            },
            &[],
            None,
        )
        .unwrap();
    f.options
        .storage
        .put_blob(&id, &hash, &blob, None, Some(f.now()), None)
        .unwrap();
    f.options
        .storage
        .commit_swap(
            &id,
            None,
            &IStoredSwap {
                header: IStoredHeader {
                    hash: random_bytes::<32>().to_vec(),
                    seq: 1,
                    bytes: vec![7; 64],
                },
                entries: vec![IStoredHeader {
                    hash: id.to_vec(),
                    seq: 0,
                    bytes: encode(&genesis).unwrap(),
                }],
                body_digest: random_bytes::<32>().to_vec(),
                files_hash: None,
                files: Some(IStoredFiles {
                    hash: h("files", &list).to_vec(),
                    bytes: list,
                    retain_forever: None,
                    versions: vec![IFileVersion {
                        file_id: file.to_vec(),
                        version: 1,
                        blob_hash: Some(hash.to_vec()),
                        tombstone: false,
                    }],
                }),
                state: None,
                vault: None,
                devices: None,
                approver: None,
                consume_sessions: None,
                close_mailbox: None,
                setup_token_hash: None,
                clear_repair_reports: None,
            },
            f.now(),
        )
        .unwrap();
    f.options
        .storage
        .put_device(
            &id,
            &device.record.id,
            &IStoredDevice {
                client_version: "1.0.0".into(),
                ..Default::default()
            },
        )
        .unwrap();
    for path in ["/", "/v1/status"] {
        let response = f
            .app
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let body = String::from_utf8(
            to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap()
                .to_vec(),
        )
        .unwrap();
        assert!(!body.contains(&device.record.name));
        for secret in [&id[..], &file[..], &hash[..], &device.record.id[..]] {
            for encoded in [
                hexadecimal(secret),
                STANDARD.encode(secret),
                URL_SAFE_NO_PAD.encode(secret),
                base32(secret),
            ] {
                assert!(!body.contains(&encoded));
            }
        }
        if path == "/v1/status" {
            let status: serde_json::Value = serde_json::from_str(&body).unwrap();
            assert_eq!(status["vaults"], 2);
            assert_eq!(status.as_object().unwrap().len(), 7);
        }
    }
}

fn hexadecimal(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[tokio::test]
async fn restored_mode_and_last_prune_are_public() {
    let f = Fixture::new();
    let mut vault = f.options.storage.vault(&f.vault).unwrap().unwrap();
    vault.restored = Some(IRestoredVault {
        repair_token_hash: vec![1; 32],
        restored_head: f.options.storage.head(&f.vault).unwrap().unwrap(),
        finish_progress: None,
    });
    f.options
        .storage
        .configure_vault(&f.vault, &vault, &[], None)
        .unwrap();
    for ok in [false, true] {
        let mut status = IStatusState::new(f.now(), None);
        status.last_prune = Some((f.now(), ok));
        let app = create_app(f.options.clone(), Arc::new(Mutex::new(status))).unwrap();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/v1/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let value: serde_json::Value =
            serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap())
                .unwrap();
        assert_eq!(value["mode"], "restored");
        assert_eq!(
            value["lastPrune"],
            json!({"at":"1970-01-01T00:16:40.000Z","ok":ok})
        );
    }
}
