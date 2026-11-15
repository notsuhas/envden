use super::fake::IFakeStorageAdapter;
use envden_core::{adapters::*, errors::Result};
macro_rules! forward {($message:literal,$name:ident($($arg:ident:$ty:ty),*) -> $ret:ty) => {
 fn $name(&self,$($arg:$ty),*) -> $ret {self.$name.as_ref().unwrap_or_else(|| panic!("Unexpected fake operation: storage.{}", $message))($($arg),*)}
};}
impl IStorageAdapter for IFakeStorageAdapter {
    fn id(&self) -> &str {
        &self.id
    }
    forward!("close",close() -> Result<()>);
    forward!("transaction",transaction(run: &mut dyn FnMut() -> Result<()>) -> Result<()>);
    forward!("vaultIds",vault_ids() -> Result<Vec<Vec<u8>>>);
    forward!("capUnlocks",cap_unlocks(vault_id: &[u8], until: u64) -> Result<()>);
    forward!("hasVault",has_vault(vault_id: &[u8]) -> Result<bool>);
    forward!("vault",vault(vault_id: &[u8]) -> Result<Option<IStoredVault>>);
    forward!("configureVault",configure_vault(vault_id: &[u8], state: &IStoredVault, writes: &[IStateWrite], setup_token_hash: Option<&[u8]>) -> Result<()>);
    forward!("discardInactiveVault",discard_inactive_vault(vault_id: &[u8]) -> Result<()>);
    forward!("findCommitted",find_committed(vault_id: &[u8], digest: &[u8]) -> Result<bool>);
    forward!("hasBlob",has_blob(vault_id: &[u8], hash: &[u8]) -> Result<bool>);
    forward!("head",head(vault_id: &[u8]) -> Result<Option<Vec<u8>>>);
    forward!("commitSwap",commit_swap(vault_id: &[u8], expected_head: Option<&[u8]>, swap: &IStoredSwap, now: u64) -> Result<TCommitResult>);
    forward!("headers",headers(vault_id: &[u8], from_seq: u64, to_seq: u64, limit: Option<usize>, max_bytes: Option<usize>) -> Result<Vec<IStoredHeader>>);
    forward!("headersForFiles",headers_for_files(vault_id: &[u8], hash: &[u8]) -> Result<Vec<IStoredHeader>>);
    forward!("header",header(vault_id: &[u8], hash: &[u8]) -> Result<Option<IStoredHeader>>);
    forward!("entries",entries(vault_id: &[u8], from_seq: u64, to_seq: u64, limit: Option<usize>, max_bytes: Option<usize>) -> Result<Vec<IStoredHeader>>);
    forward!("putFileList",put_file_list(vault_id: &[u8], files: &IStoredFiles, now: u64) -> Result<()>);
    forward!("fileList",file_list(vault_id: &[u8], hash: &[u8]) -> Result<Option<Vec<u8>>>);
    forward!("state",state(vault_id: &[u8], kind: TStateKind, key: &[u8]) -> Result<Option<Vec<u8>>>);
    forward!("states",states(vault_id: &[u8], kind: TStateKind) -> Result<Vec<IStateEntry>>);
    forward!("writeState",write_state(vault_id: &[u8], writes: &[IStateWrite]) -> Result<()>);
    forward!("device",device(vault_id: &[u8], device: &[u8]) -> Result<Option<IStoredDevice>>);
    forward!("putDevice",put_device(vault_id: &[u8], device: &[u8], state: &IStoredDevice) -> Result<()>);
    forward!("putBlob",put_blob(vault_id: &[u8], hash: &[u8], bytes: &[u8], verify: Option<TVerifyBlob<'_>>, now: Option<u64>, quota_bytes: Option<u64>) -> Result<()>);
    forward!("getBlob",get_blob(vault_id: &[u8], hash: &[u8]) -> Result<Option<Vec<u8>>>);
    forward!("blobHashes",blob_hashes(vault_id: &[u8]) -> Result<Vec<Vec<u8>>>);
    forward!("vaultUsage",vault_usage(vault_id: &[u8]) -> Result<u64>);
    forward!("prune",prune(vault_id: &[u8], policy: &IHistoryPolicy, now: u64) -> Result<IPruneResult>);
    forward!("setupToken",setup_token() -> Result<Option<Vec<u8>>>);
    forward!("setSetupToken",set_setup_token(hash: &[u8]) -> Result<()>);
    forward!("putSession",put_session(vault_id: &[u8], key: &ISessionKey, bytes: &[u8], now: u64) -> Result<()>);
    forward!("session",session(vault_id: &[u8], key: &ISessionKey, now: u64) -> Result<Option<Vec<u8>>>);
    forward!("consumeSession",consume_session(vault_id: &[u8], key: &ISessionKey, now: u64) -> Result<Option<Vec<u8>>>);
    forward!("charge",charge(vault_id: &[u8], bucket: &TRateBucket, now: u64) -> Result<TRateCharge>);
    forward!("refund",refund(receipt: &str, now: u64) -> Result<bool>);
    forward!("openMailbox",open_mailbox(vault_id: &[u8], device: &[u8], now: u64) -> Result<Option<IStoredMailbox>>);
    forward!("mailbox",mailbox(vault_id: &[u8], number: u64, now: u64) -> Result<Option<IStoredMailbox>>);
    forward!("writeMailbox",write_mailbox(vault_id: &[u8], number: u64, slot: TMailboxSlot, bytes: &[u8], now: u64) -> Result<TMailboxWrite>);
    forward!("closeMailbox",close_mailbox(vault_id: &[u8], number: u64) -> Result<()>);
    forward!("approver",approver(vault_id: &[u8], device: &[u8], now: u64) -> Result<Option<Vec<u8>>>);
    forward!("rememberNonce",remember_nonce(device: &[u8], nonce: &[u8], now: u64) -> Result<bool>);
}
