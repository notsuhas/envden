use super::{super::fake::IFakeStorageAdapter, data::IMemory};
use std::sync::Arc;
pub fn create_memory_storage_adapter(operations: &[&str]) -> IFakeStorageAdapter {
    let memory = Arc::new(IMemory::default());
    let mut adapter = IFakeStorageAdapter {
        id: "memory".into(),
        ..Default::default()
    };
    macro_rules! select {($name:ident($($arg:ident),*)) => {if operations.contains(&stringify!($name)) {let memory=memory.clone();adapter.$name=Some(Box::new(move |$($arg),*| memory.$name($($arg),*)));}};}
    select!(close());
    select!(transaction(run));
    select!(vault_ids());
    select!(cap_unlocks(vault_id, until));
    select!(has_vault(vault_id));
    select!(vault(vault_id));
    select!(configure_vault(vault_id, state, writes, setup_token_hash));
    select!(discard_inactive_vault(vault_id));
    select!(find_committed(vault_id, digest));
    select!(has_blob(vault_id, hash));
    select!(head(vault_id));
    select!(commit_swap(vault_id, expected_head, swap, now));
    select!(headers(vault_id, from_seq, to_seq, limit, max_bytes));
    select!(headers_for_files(vault_id, hash));
    select!(header(vault_id, hash));
    select!(entries(vault_id, from_seq, to_seq, limit, max_bytes));
    select!(put_file_list(vault_id, files, now));
    select!(file_list(vault_id, hash));
    select!(state(vault_id, kind, key));
    select!(states(vault_id, kind));
    select!(write_state(vault_id, writes));
    select!(device(vault_id, device));
    select!(put_device(vault_id, device, state));
    select!(put_blob(vault_id, hash, bytes, verify, now, quota_bytes));
    select!(get_blob(vault_id, hash));
    select!(blob_hashes(vault_id));
    select!(vault_usage(vault_id));
    select!(prune(vault_id, policy, now));
    select!(setup_token());
    select!(set_setup_token(hash));
    select!(put_session(vault_id, key, bytes, now));
    select!(session(vault_id, key, now));
    select!(consume_session(vault_id, key, now));
    select!(charge(vault_id, bucket, now));
    select!(refund(receipt, now));
    select!(open_mailbox(vault_id, device, now));
    select!(mailbox(vault_id, number, now));
    select!(write_mailbox(vault_id, number, slot, bytes, now));
    select!(close_mailbox(vault_id, number));
    select!(approver(vault_id, device, now));
    select!(remember_nonce(device, nonce, now));
    adapter
}
