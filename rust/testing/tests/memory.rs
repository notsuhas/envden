use envden_core::adapters::*;
use envden_testing::{keychain::*, storage::*};
use std::sync::Arc;
#[test]
fn memory_keychain_contract() {
    keychain_contract(|_| {
        Box::new(create_memory_keychain_adapter(&[
            "get",
            "set",
            "delete",
            "owner_only",
        ]))
    });
}
#[test]
fn memory_storage_contract() {
    storage_contract(|| {
        let adapter: Arc<dyn IStorageAdapter> = Arc::new(create_memory_storage_adapter(&OPS));
        let reopened = adapter.clone();
        IStorageFixture {
            storage: adapter,
            reopen: Box::new(move || reopened.clone()),
            dispose: Box::new(|| {}),
        }
    });
}
const OPS: [&str; 41] = [
    "close",
    "transaction",
    "vault_ids",
    "cap_unlocks",
    "has_vault",
    "vault",
    "configure_vault",
    "discard_inactive_vault",
    "find_committed",
    "has_blob",
    "head",
    "commit_swap",
    "headers",
    "headers_for_files",
    "header",
    "entries",
    "put_file_list",
    "file_list",
    "state",
    "states",
    "write_state",
    "device",
    "put_device",
    "put_blob",
    "get_blob",
    "blob_hashes",
    "vault_usage",
    "prune",
    "setup_token",
    "set_setup_token",
    "put_session",
    "session",
    "consume_session",
    "charge",
    "refund",
    "open_mailbox",
    "mailbox",
    "write_mailbox",
    "close_mailbox",
    "approver",
    "remember_nonce",
];
#[test]
fn memory_adapters_require_explicit_operations_and_roll_back() {
    let keychain = create_memory_keychain_adapter(&["get", "set"]);
    assert!(
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| keychain.owner_only())).is_err()
    );
    keychain.set("key", &[1]).unwrap();
    let mut value = keychain.get("key", false).unwrap().unwrap();
    value.fill(9);
    assert_eq!(keychain.get("key", false).unwrap(), Some(vec![1]));
    let storage = create_memory_storage_adapter(&["transaction", "set_setup_token", "setup_token"]);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| storage.head(&[]))).is_err());
    let result = storage.transaction(&mut || {
        storage.set_setup_token(&[1])?;
        Err(envden_core::errors::EnvdenError::new(
            envden_core::errors::ErrorCode::InvalidData,
            "Abort transaction",
        ))
    });
    assert_eq!(result.unwrap_err().message, "Abort transaction");
    assert!(storage.setup_token().unwrap().is_none());
}
