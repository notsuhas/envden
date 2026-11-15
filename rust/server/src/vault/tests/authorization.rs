use super::*;
use crate::http::types::IServerKeys;
use envden_testing::storage::IFakeStorageAdapter;
use std::sync::{Arc, Mutex};

fn fixture() -> (IAppOptions, IAuth, ISwap, IStoredSwap) {
    let options = IAppOptions {
        storage: Arc::new(IFakeStorageAdapter {
            vault: Some(Box::new(|_| {
                Ok(Some(IStoredVault {
                    active: true,
                    ..Default::default()
                }))
            })),
            device: Some(Box::new(|_, _| {
                Ok(Some(IStoredDevice {
                    unlocked_until: 200,
                    fresh_until: 200,
                    ..Default::default()
                }))
            })),
            ..Default::default()
        }),
        storage_lock: Arc::new(Mutex::new(())),
        now: Arc::new(|| 100),
        server_keys: IServerKeys {
            public_key: [0; 32],
            secret_key: [0; 32],
            opaque_setup: String::new(),
        },
        app_version: "1.0.0".into(),
        min_client: "1.0.0".into(),
    };
    let auth = IAuth {
        request: IRequest {
            server_pin: [0; 32],
            vault_id: [0; 32],
            method: "POST".into(),
            path_and_query: "/v1/swap".into(),
            body_hash: [0; 32],
            time: 100,
            nonce: [0; 16],
            device: [0; 16],
            client_version: "1.0.0".into(),
        },
        member: true,
        proof: None,
    };
    let header = IManifestHeader {
        vault_id: [0; 32],
        seq: 1,
        op: 11,
        prev: [0; 32],
        list_seq: 0,
        list_head: [0; 32],
        epoch: 1,
        keyring_hash: [0; 32],
        envelope_hash: [0; 32],
        files_hash: [0; 32],
        created_at: 1,
        signer: [0; 16],
    };
    let swap = ISwap {
        expected_head: [0; 32],
        entries: vec![],
        header: ISigned {
            body: header,
            signature: vec![0; 64],
        },
        files: None,
        keyring: None,
        envelope: None,
        sk_pub: None,
        opaque_record: None,
        approver: None,
    };
    let stored = crate::vault::stored_swap(&swap, &[0; 32]).unwrap();
    (options, auth, swap, stored)
}

#[test]
fn repair_token_rejects_fresh_active_vault() {
    let (options, auth, swap, mut stored) = fixture();
    assert_eq!(
        authorize(
            &options,
            &auth,
            &swap,
            TAuthorization::RepairToken,
            &mut stored,
            None
        )
        .unwrap_err()
        .code,
        ErrorCode::Unauthorized
    );
}

#[test]
fn staged_record_is_checked_during_authorization() {
    let (mut options, auth, mut swap, mut stored) = fixture();
    options.storage = Arc::new(IFakeStorageAdapter {
        device: Some(Box::new(|_, _| {
            Ok(Some(IStoredDevice {
                unlocked_until: 200,
                fresh_until: 200,
                ..Default::default()
            }))
        })),
        vault: Some(Box::new(|_| {
            Ok(Some(IStoredVault {
                active: true,
                ..Default::default()
            }))
        })),
        session: Some(Box::new(|_, _, _| Ok(None))),
        ..Default::default()
    });
    swap.opaque_record = Some(vec![7; 192]);
    assert_eq!(
        authorize(
            &options,
            &auth,
            &swap,
            TAuthorization::Fresh,
            &mut stored,
            None
        )
        .unwrap_err()
        .code,
        ErrorCode::Unauthorized
    );
}
