use envden_core::adapters::*;
use envden_testing::storage;
fn sample_swap() -> IStoredSwap {
    IStoredSwap {
        header: IStoredHeader {
            seq: 0,
            hash: vec![],
            bytes: vec![],
        },
        entries: vec![],
        body_digest: vec![],
        vault: None,
        files_hash: None,
        files: None,
        state: None,
        devices: None,
        approver: None,
        consume_sessions: None,
        close_mailbox: None,
        setup_token_hash: None,
        clear_repair_reports: None,
    }
}
#[test]
fn storage_close_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().close();
        })
        .is_err()
    );
}

#[test]
fn storage_transaction_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().transaction(&mut || Ok(()));
        })
        .is_err()
    );
}

#[test]
fn storage_vault_ids_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().vault_ids();
        })
        .is_err()
    );
}

#[test]
fn storage_cap_unlocks_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().cap_unlocks(&[], 0);
        })
        .is_err()
    );
}

#[test]
fn storage_has_vault_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().has_vault(&[]);
        })
        .is_err()
    );
}

#[test]
fn storage_vault_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().vault(&[]);
        })
        .is_err()
    );
}

#[test]
fn storage_configure_vault_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().configure_vault(
                &[],
                &IStoredVault::default(),
                &[],
                None,
            );
        })
        .is_err()
    );
}

#[test]
fn storage_discard_inactive_vault_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().discard_inactive_vault(&[]);
        })
        .is_err()
    );
}

#[test]
fn storage_find_committed_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().find_committed(&[], &[]);
        })
        .is_err()
    );
}

#[test]
fn storage_has_blob_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().has_blob(&[], &[]);
        })
        .is_err()
    );
}

#[test]
fn storage_head_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().head(&[]);
        })
        .is_err()
    );
}

#[test]
fn storage_commit_swap_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ =
                storage::IFakeStorageAdapter::default().commit_swap(&[], None, &sample_swap(), 0);
        })
        .is_err()
    );
}

#[test]
fn storage_headers_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().headers(&[], 0, 0, None, None);
        })
        .is_err()
    );
}

#[test]
fn storage_headers_for_files_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().headers_for_files(&[], &[]);
        })
        .is_err()
    );
}

#[test]
fn storage_header_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().header(&[], &[]);
        })
        .is_err()
    );
}

#[test]
fn storage_entries_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().entries(&[], 0, 0, None, None);
        })
        .is_err()
    );
}

#[test]
fn storage_put_file_list_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().put_file_list(
                &[],
                &IStoredFiles {
                    hash: vec![],
                    bytes: vec![],
                    versions: vec![],
                    retain_forever: None,
                },
                0,
            );
        })
        .is_err()
    );
}

#[test]
fn storage_file_list_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().file_list(&[], &[]);
        })
        .is_err()
    );
}

#[test]
fn storage_state_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().state(&[], TStateKind::Keyring, &[]);
        })
        .is_err()
    );
}

#[test]
fn storage_states_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().states(&[], TStateKind::Keyring);
        })
        .is_err()
    );
}

#[test]
fn storage_write_state_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().write_state(&[], &[]);
        })
        .is_err()
    );
}

#[test]
fn storage_device_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().device(&[], &[]);
        })
        .is_err()
    );
}

#[test]
fn storage_put_device_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().put_device(
                &[],
                &[],
                &IStoredDevice::default(),
            );
        })
        .is_err()
    );
}
