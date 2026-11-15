use envden_core::adapters::*;
use envden_testing::storage;
#[test]
fn storage_put_blob_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ =
                storage::IFakeStorageAdapter::default().put_blob(&[], &[], &[], None, None, None);
        })
        .is_err()
    );
}

#[test]
fn storage_get_blob_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().get_blob(&[], &[]);
        })
        .is_err()
    );
}

#[test]
fn storage_blob_hashes_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().blob_hashes(&[]);
        })
        .is_err()
    );
}

#[test]
fn storage_vault_usage_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().vault_usage(&[]);
        })
        .is_err()
    );
}

#[test]
fn storage_prune_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().prune(
                &[],
                &IHistoryPolicy {
                    max_age: 0,
                    min_versions: 1,
                },
                0,
            );
        })
        .is_err()
    );
}

#[test]
fn storage_setup_token_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().setup_token();
        })
        .is_err()
    );
}

#[test]
fn storage_set_setup_token_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().set_setup_token(&[]);
        })
        .is_err()
    );
}

#[test]
fn storage_put_session_is_strict() {
    assert!(
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
        })
        .is_err()
    );
}

#[test]
fn storage_session_is_strict() {
    assert!(
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
        })
        .is_err()
    );
}

#[test]
fn storage_consume_session_is_strict() {
    assert!(
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
        })
        .is_err()
    );
}

#[test]
fn storage_charge_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().charge(&[], &TRateBucket::NonMember, 0);
        })
        .is_err()
    );
}

#[test]
fn storage_refund_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().refund("", 0);
        })
        .is_err()
    );
}

#[test]
fn storage_open_mailbox_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().open_mailbox(&[], &[], 0);
        })
        .is_err()
    );
}

#[test]
fn storage_mailbox_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().mailbox(&[], 0, 0);
        })
        .is_err()
    );
}

#[test]
fn storage_write_mailbox_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().write_mailbox(
                &[],
                0,
                TMailboxSlot::KE1,
                &[],
                0,
            );
        })
        .is_err()
    );
}

#[test]
fn storage_close_mailbox_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().close_mailbox(&[], 0);
        })
        .is_err()
    );
}

#[test]
fn storage_approver_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().approver(&[], &[], 0);
        })
        .is_err()
    );
}

#[test]
fn storage_remember_nonce_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().remember_nonce(&[], &[], 0);
        })
        .is_err()
    );
}
