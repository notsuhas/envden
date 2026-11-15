use super::SqliteStorageAdapter;
use super::forwarding::forward;
use envden_core::{adapters::*, errors::Result};

impl IStorageAdapter for SqliteStorageAdapter {
    fn id(&self) -> &str {
        "sqlite"
    }
    fn close(&self) -> Result<()> {
        let _guard = self.gate.lock();
        let db = self.connection.lock().take();
        if let Some(db) = db {
            db.close().map_err(|(_, e)| crate::db::fail(e))?;
        }
        Ok(())
    }
    fn transaction(&self, run: &mut dyn FnMut() -> Result<()>) -> Result<()> {
        let _guard = self.gate.lock();
        self.atomic(run)?;
        self.collect_garbage()
    }
    forward!(vault_ids() -> Result<Vec<Vec<u8>>>);
    forward!(cap_unlocks(vault_id: &[u8], until: u64) -> Result<()>);
    forward!(has_vault(vault_id: &[u8]) -> Result<bool>);
    forward!(vault(vault_id: &[u8]) -> Result<Option<IStoredVault>>);
    forward!(configure_vault(vault_id: &[u8],
        state: &IStoredVault,
        writes: &[IStateWrite],
        setup_token_hash: Option<&[u8]>,) -> Result<()>);
    forward!(discard_inactive_vault(vault_id: &[u8]) -> Result<()>);
    forward!(find_committed(vault_id: &[u8], digest: &[u8]) -> Result<bool>);
    forward!(has_blob(vault_id: &[u8], hash: &[u8]) -> Result<bool>);
    forward!(head(vault_id: &[u8]) -> Result<Option<Vec<u8>>>);
    forward!(commit_swap(vault_id: &[u8],
        expected_head: Option<&[u8]>,
        swap: &IStoredSwap,
        now: u64,) -> Result<TCommitResult>);
    forward!(headers(vault_id: &[u8],
        from_seq: u64,
        to_seq: u64,
        limit: Option<usize>,
        max_bytes: Option<usize>,) -> Result<Vec<IStoredHeader>>);
    forward!(headers_for_files(vault_id: &[u8], hash: &[u8]) -> Result<Vec<IStoredHeader>>);
    forward!(header(vault_id: &[u8], hash: &[u8]) -> Result<Option<IStoredHeader>>);
    forward!(entries(vault_id: &[u8],
        from_seq: u64,
        to_seq: u64,
        limit: Option<usize>,
        max_bytes: Option<usize>,) -> Result<Vec<IStoredHeader>>);
    forward!(put_file_list(vault_id: &[u8], files: &IStoredFiles, now: u64) -> Result<()>);
    forward!(file_list(vault_id: &[u8], hash: &[u8]) -> Result<Option<Vec<u8>>>);
    forward!(state(vault_id: &[u8], kind: TStateKind, key: &[u8]) -> Result<Option<Vec<u8>>>);
    forward!(states(vault_id: &[u8], kind: TStateKind) -> Result<Vec<IStateEntry>>);
    forward!(write_state(vault_id: &[u8], writes: &[IStateWrite]) -> Result<()>);
    forward!(device(vault_id: &[u8], device: &[u8]) -> Result<Option<IStoredDevice>>);
    forward!(put_device(vault_id: &[u8], device: &[u8], state: &IStoredDevice) -> Result<()>);
    forward!(put_blob(vault_id: &[u8],
        hash: &[u8],
        bytes: &[u8],
        verify: Option<TVerifyBlob<'_>>,
        now: Option<u64>,
        quota_bytes: Option<u64>,) -> Result<()>);
    forward!(get_blob(vault_id: &[u8], hash: &[u8]) -> Result<Option<Vec<u8>>>);
    forward!(blob_hashes(vault_id: &[u8]) -> Result<Vec<Vec<u8>>>);
    forward!(vault_usage(vault_id: &[u8]) -> Result<u64>);
    forward!(prune(vault_id: &[u8], policy: &IHistoryPolicy, now: u64) -> Result<IPruneResult>);
    forward!(setup_token() -> Result<Option<Vec<u8>>>);
    forward!(set_setup_token(hash: &[u8]) -> Result<()>);
    forward!(put_session(vault_id: &[u8],
        key: &ISessionKey,
        bytes: &[u8],
        now: u64,) -> Result<()>);
    forward!(session(vault_id: &[u8], key: &ISessionKey, now: u64) -> Result<Option<Vec<u8>>>);
    forward!(consume_session(vault_id: &[u8],
        key: &ISessionKey,
        now: u64,) -> Result<Option<Vec<u8>>>);
    forward!(charge(vault_id: &[u8], bucket: &TRateBucket, now: u64) -> Result<TRateCharge>);
    forward!(refund(receipt: &str, now: u64) -> Result<bool>);
    forward!(open_mailbox(vault_id: &[u8],
        device: &[u8],
        now: u64,) -> Result<Option<IStoredMailbox>>);
    forward!(mailbox(vault_id: &[u8], number: u64, now: u64) -> Result<Option<IStoredMailbox>>);
    forward!(write_mailbox(vault_id: &[u8],
        number: u64,
        slot: TMailboxSlot,
        bytes: &[u8],
        now: u64,) -> Result<TMailboxWrite>);
    forward!(close_mailbox(vault_id: &[u8], number: u64) -> Result<()>);
    forward!(approver(vault_id: &[u8], device: &[u8], now: u64) -> Result<Option<Vec<u8>>>);
    forward!(remember_nonce(device: &[u8], nonce: &[u8], now: u64) -> Result<bool>);
}
