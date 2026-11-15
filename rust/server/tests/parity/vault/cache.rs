use crate::support::Fixture;
use envden_core::adapters::storage::*;
use envden_protocol::protocol::*;
use envden_server::{create_app, status::IStatusState};
use envden_testing::storage::IFakeStorageAdapter;
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};

#[tokio::test]
async fn manifest_only_changes_reuse_the_verified_device_list() {
    let mut f = Fixture::new();
    f.fresh();
    let original = f.options.storage.clone();
    let head = original.clone();
    let header = original.clone();
    let entries = original.clone();
    let vault = original.clone();
    let has_vault = original.clone();
    let device = original.clone();
    let nonces = original.clone();
    let close = original.clone();
    let reads = Arc::new(AtomicUsize::new(0));
    let counter = reads.clone();
    f.options.storage = Arc::new(IFakeStorageAdapter {
        head: Some(Box::new(move |id| head.head(id))),
        header: Some(Box::new(move |id, hash| header.header(id, hash))),
        entries: Some(Box::new(move |id, from, to, limit, bytes| {
            counter.fetch_add(1, Ordering::SeqCst);
            entries.entries(id, from, to, limit, bytes)
        })),
        vault: Some(Box::new(move |id| vault.vault(id))),
        has_vault: Some(Box::new(move |id| has_vault.has_vault(id))),
        device: Some(Box::new(move |id, who| device.device(id, who))),
        remember_nonce: Some(Box::new(move |who, nonce, now| {
            nonces.remember_nonce(who, nonce, now)
        })),
        close: Some(Box::new(move || close.close())),
        ..Default::default()
    });
    f.app = create_app(
        f.options.clone(),
        Arc::new(Mutex::new(IStatusState::new(f.now(), None))),
    )
    .unwrap();
    assert_eq!(
        f.send("/v1/settings/unlock-period", "GET", Value::Null, &f.member)
            .await,
        (200, json!({"period":2592000000_u64}))
    );
    let old = original.head(&f.vault).unwrap().unwrap();
    let mut header: ISigned<IManifestHeader> =
        decode(&original.header(&f.vault, &old).unwrap().unwrap().bytes).unwrap();
    header.body.seq = 2;
    header.body.op = 8;
    header.body.prev = fixed(&old).unwrap();
    let header = sign_object(header.body, &f.member.keys.recovery.obj_sk, "manifest").unwrap();
    let hash = object_hash(&header, "manifest").unwrap();
    original
        .commit_swap(
            &f.vault,
            Some(&old),
            &IStoredSwap {
                header: IStoredHeader {
                    hash: hash.to_vec(),
                    seq: 2,
                    bytes: encode(&header).unwrap(),
                },
                entries: vec![],
                body_digest: hash.to_vec(),
                files_hash: None,
                files: None,
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
    assert_eq!(
        f.send("/v1/settings/unlock-period", "GET", Value::Null, &f.member)
            .await,
        (200, json!({"period":2592000000_u64}))
    );
    assert_eq!(reads.load(Ordering::SeqCst), 1);
}
