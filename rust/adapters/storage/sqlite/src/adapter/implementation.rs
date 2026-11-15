use super::SqliteStorageAdapter;
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
    fn vault_ids(&self) -> Result<Vec<Vec<u8>>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::vault_ids(self)
    }
    fn cap_unlocks(&self, vault_id: &[u8], until: u64) -> Result<()> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::cap_unlocks(self, vault_id, until)
    }
    fn has_vault(&self, vault_id: &[u8]) -> Result<bool> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::has_vault(self, vault_id)
    }
    fn vault(&self, vault_id: &[u8]) -> Result<Option<IStoredVault>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::vault(self, vault_id)
    }
    fn configure_vault(
        &self,
        vault_id: &[u8],
        state: &IStoredVault,
        writes: &[IStateWrite],
        setup_token_hash: Option<&[u8]>,
    ) -> Result<()> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::configure_vault(self, vault_id, state, writes, setup_token_hash)
    }
    fn discard_inactive_vault(&self, vault_id: &[u8]) -> Result<()> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::discard_inactive_vault(self, vault_id)
    }
    fn find_committed(&self, vault_id: &[u8], digest: &[u8]) -> Result<bool> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::find_committed(self, vault_id, digest)
    }
    fn has_blob(&self, vault_id: &[u8], hash: &[u8]) -> Result<bool> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::has_blob(self, vault_id, hash)
    }
    fn head(&self, vault_id: &[u8]) -> Result<Option<Vec<u8>>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::head(self, vault_id)
    }
    fn commit_swap(
        &self,
        vault_id: &[u8],
        expected_head: Option<&[u8]>,
        swap: &IStoredSwap,
        now: u64,
    ) -> Result<TCommitResult> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::commit_swap(self, vault_id, expected_head, swap, now)
    }
    fn headers(
        &self,
        vault_id: &[u8],
        from_seq: u64,
        to_seq: u64,
        limit: Option<usize>,
        max_bytes: Option<usize>,
    ) -> Result<Vec<IStoredHeader>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::headers(self, vault_id, from_seq, to_seq, limit, max_bytes)
    }
    fn headers_for_files(&self, vault_id: &[u8], hash: &[u8]) -> Result<Vec<IStoredHeader>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::headers_for_files(self, vault_id, hash)
    }
    fn header(&self, vault_id: &[u8], hash: &[u8]) -> Result<Option<IStoredHeader>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::header(self, vault_id, hash)
    }
    fn entries(
        &self,
        vault_id: &[u8],
        from_seq: u64,
        to_seq: u64,
        limit: Option<usize>,
        max_bytes: Option<usize>,
    ) -> Result<Vec<IStoredHeader>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::entries(self, vault_id, from_seq, to_seq, limit, max_bytes)
    }
    fn put_file_list(&self, vault_id: &[u8], files: &IStoredFiles, now: u64) -> Result<()> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::put_file_list(self, vault_id, files, now)
    }
    fn file_list(&self, vault_id: &[u8], hash: &[u8]) -> Result<Option<Vec<u8>>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::file_list(self, vault_id, hash)
    }
    fn state(&self, vault_id: &[u8], kind: TStateKind, key: &[u8]) -> Result<Option<Vec<u8>>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::state(self, vault_id, kind, key)
    }
    fn states(&self, vault_id: &[u8], kind: TStateKind) -> Result<Vec<IStateEntry>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::states(self, vault_id, kind)
    }
    fn write_state(&self, vault_id: &[u8], writes: &[IStateWrite]) -> Result<()> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::write_state(self, vault_id, writes)
    }
    fn device(&self, vault_id: &[u8], device: &[u8]) -> Result<Option<IStoredDevice>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::device(self, vault_id, device)
    }
    fn put_device(&self, vault_id: &[u8], device: &[u8], state: &IStoredDevice) -> Result<()> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::put_device(self, vault_id, device, state)
    }
    fn put_blob(
        &self,
        vault_id: &[u8],
        hash: &[u8],
        bytes: &[u8],
        verify: Option<TVerifyBlob<'_>>,
        now: Option<u64>,
        quota_bytes: Option<u64>,
    ) -> Result<()> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::put_blob(self, vault_id, hash, bytes, verify, now, quota_bytes)
    }
    fn get_blob(&self, vault_id: &[u8], hash: &[u8]) -> Result<Option<Vec<u8>>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::get_blob(self, vault_id, hash)
    }
    fn blob_hashes(&self, vault_id: &[u8]) -> Result<Vec<Vec<u8>>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::blob_hashes(self, vault_id)
    }
    fn vault_usage(&self, vault_id: &[u8]) -> Result<u64> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::vault_usage(self, vault_id)
    }
    fn prune(&self, vault_id: &[u8], policy: &IHistoryPolicy, now: u64) -> Result<IPruneResult> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::prune(self, vault_id, policy, now)
    }
    fn setup_token(&self) -> Result<Option<Vec<u8>>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::setup_token(self)
    }
    fn set_setup_token(&self, hash: &[u8]) -> Result<()> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::set_setup_token(self, hash)
    }
    fn put_session(
        &self,
        vault_id: &[u8],
        key: &ISessionKey,
        bytes: &[u8],
        now: u64,
    ) -> Result<()> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::put_session(self, vault_id, key, bytes, now)
    }
    fn session(&self, vault_id: &[u8], key: &ISessionKey, now: u64) -> Result<Option<Vec<u8>>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::session(self, vault_id, key, now)
    }
    fn consume_session(
        &self,
        vault_id: &[u8],
        key: &ISessionKey,
        now: u64,
    ) -> Result<Option<Vec<u8>>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::consume_session(self, vault_id, key, now)
    }
    fn charge(&self, vault_id: &[u8], bucket: &TRateBucket, now: u64) -> Result<TRateCharge> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::charge(self, vault_id, bucket, now)
    }
    fn refund(&self, receipt: &str, now: u64) -> Result<bool> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::refund(self, receipt, now)
    }
    fn open_mailbox(
        &self,
        vault_id: &[u8],
        device: &[u8],
        now: u64,
    ) -> Result<Option<IStoredMailbox>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::open_mailbox(self, vault_id, device, now)
    }
    fn mailbox(&self, vault_id: &[u8], number: u64, now: u64) -> Result<Option<IStoredMailbox>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::mailbox(self, vault_id, number, now)
    }
    fn write_mailbox(
        &self,
        vault_id: &[u8],
        number: u64,
        slot: TMailboxSlot,
        bytes: &[u8],
        now: u64,
    ) -> Result<TMailboxWrite> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::write_mailbox(self, vault_id, number, slot, bytes, now)
    }
    fn close_mailbox(&self, vault_id: &[u8], number: u64) -> Result<()> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::close_mailbox(self, vault_id, number)
    }
    fn approver(&self, vault_id: &[u8], device: &[u8], now: u64) -> Result<Option<Vec<u8>>> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::approver(self, vault_id, device, now)
    }
    fn remember_nonce(&self, device: &[u8], nonce: &[u8], now: u64) -> Result<bool> {
        let _guard = self.gate.lock();
        SqliteStorageAdapter::remember_nonce(self, device, nonce, now)
    }
}
