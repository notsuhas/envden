use envden_core::adapters::*;
use envden_testing::storage;
#[test]
fn storage_header_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().header(&[], &[]);
        }),
        "storage.header",
    );
}

#[test]
fn storage_entries_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().entries(&[], 0, 0, None, None);
        }),
        "storage.entries",
    );
}

#[test]
fn storage_put_file_list_is_strict() {
    super::unexpected(
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
        }),
        "storage.putFileList",
    );
}

#[test]
fn storage_file_list_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().file_list(&[], &[]);
        }),
        "storage.fileList",
    );
}

#[test]
fn storage_state_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().state(&[], TStateKind::Keyring, &[]);
        }),
        "storage.state",
    );
}

#[test]
fn storage_states_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().states(&[], TStateKind::Keyring);
        }),
        "storage.states",
    );
}

#[test]
fn storage_write_state_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().write_state(&[], &[]);
        }),
        "storage.writeState",
    );
}

#[test]
fn storage_device_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().device(&[], &[]);
        }),
        "storage.device",
    );
}

#[test]
fn storage_put_device_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().put_device(
                &[],
                &[],
                &IStoredDevice::default(),
            );
        }),
        "storage.putDevice",
    );
}

#[test]
fn storage_write_mailbox_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().write_mailbox(
                &[],
                0,
                TMailboxSlot::KE1,
                &[],
                0,
            );
        }),
        "storage.writeMailbox",
    );
}

#[test]
fn storage_close_mailbox_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().close_mailbox(&[], 0);
        }),
        "storage.closeMailbox",
    );
}

#[test]
fn storage_approver_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().approver(&[], &[], 0);
        }),
        "storage.approver",
    );
}

#[test]
fn storage_remember_nonce_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = storage::IFakeStorageAdapter::default().remember_nonce(&[], &[], 0);
        }),
        "storage.rememberNonce",
    );
}
