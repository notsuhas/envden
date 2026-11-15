use envden_core::adapters::*;
use envden_testing::storage;
#[test]
fn storage_put_blob_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ =
                storage::IFakeStorageAdapter::default().put_blob(&[], &[], &[], None, None, None);
        }),
        "storage.putBlob",
    );
}

#[test]
fn storage_get_blob_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().get_blob(&[], &[]);
        }),
        "storage.getBlob",
    );
}

#[test]
fn storage_blob_hashes_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().blob_hashes(&[]);
        }),
        "storage.blobHashes",
    );
}

#[test]
fn storage_vault_usage_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().vault_usage(&[]);
        }),
        "storage.vaultUsage",
    );
}

#[test]
fn storage_prune_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().prune(
                &[],
                &IHistoryPolicy {
                    max_age: 0,
                    min_versions: 1,
                },
                0,
            );
        }),
        "storage.prune",
    );
}

#[test]
fn storage_setup_token_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().setup_token();
        }),
        "storage.setupToken",
    );
}

#[test]
fn storage_set_setup_token_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().set_setup_token(&[]);
        }),
        "storage.setSetupToken",
    );
}

#[test]
fn storage_put_session_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().put_session(
                &[],
                &ISessionKey {
                    kind: TSessionKind::Login,
                    device: vec![],
                    purpose: String::new(),
                },
                &[],
                0,
            );
        }),
        "storage.putSession",
    );
}

#[test]
fn storage_session_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().session(
                &[],
                &ISessionKey {
                    kind: TSessionKind::Login,
                    device: vec![],
                    purpose: String::new(),
                },
                0,
            );
        }),
        "storage.session",
    );
}

#[test]
fn storage_consume_session_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().consume_session(
                &[],
                &ISessionKey {
                    kind: TSessionKind::Login,
                    device: vec![],
                    purpose: String::new(),
                },
                0,
            );
        }),
        "storage.consumeSession",
    );
}

#[test]
fn storage_charge_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().charge(&[], &TRateBucket::NonMember, 0);
        }),
        "storage.charge",
    );
}

#[test]
fn storage_refund_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().refund("", 0);
        }),
        "storage.refund",
    );
}

#[test]
fn storage_open_mailbox_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().open_mailbox(&[], &[], 0);
        }),
        "storage.openMailbox",
    );
}

#[test]
fn storage_mailbox_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().mailbox(&[], 0, 0);
        }),
        "storage.mailbox",
    );
}
