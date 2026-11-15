use envden_core::adapters::*;
use envden_testing::storage;
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
