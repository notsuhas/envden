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
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().close();
        }),
        "storage.close",
    );
}

#[test]
fn storage_transaction_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().transaction(&mut || Ok(()));
        }),
        "storage.transaction",
    );
}

#[test]
fn storage_vault_ids_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().vault_ids();
        }),
        "storage.vaultIds",
    );
}

#[test]
fn storage_cap_unlocks_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().cap_unlocks(&[], 0);
        }),
        "storage.capUnlocks",
    );
}

#[test]
fn storage_has_vault_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().has_vault(&[]);
        }),
        "storage.hasVault",
    );
}

#[test]
fn storage_vault_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().vault(&[]);
        }),
        "storage.vault",
    );
}

#[test]
fn storage_configure_vault_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().configure_vault(
                &[],
                &IStoredVault::default(),
                &[],
                None,
            );
        }),
        "storage.configureVault",
    );
}

#[test]
fn storage_discard_inactive_vault_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().discard_inactive_vault(&[]);
        }),
        "storage.discardInactiveVault",
    );
}

#[test]
fn storage_find_committed_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().find_committed(&[], &[]);
        }),
        "storage.findCommitted",
    );
}

#[test]
fn storage_has_blob_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().has_blob(&[], &[]);
        }),
        "storage.hasBlob",
    );
}

#[test]
fn storage_head_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().head(&[]);
        }),
        "storage.head",
    );
}

#[test]
fn storage_commit_swap_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ =
                storage::IFakeStorageAdapter::default().commit_swap(&[], None, &sample_swap(), 0);
        }),
        "storage.commitSwap",
    );
}

#[test]
fn storage_headers_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().headers(&[], 0, 0, None, None);
        }),
        "storage.headers",
    );
}

#[test]
fn storage_headers_for_files_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().headers_for_files(&[], &[]);
        }),
        "storage.headersForFiles",
    );
}
