use super::types::*;
use crate::errors::Result;
pub trait IStorageAdapter: Send + Sync {
    fn id(&self) -> &str;
    fn close(&self) -> Result<()>;
    fn transaction(&self, run: &mut dyn FnMut() -> Result<()>) -> Result<()>;
    fn vault_ids(&self) -> Result<Vec<Vec<u8>>>;
    fn cap_unlocks(&self, vault_id: &[u8], until: u64) -> Result<()>;
    fn has_vault(&self, vault_id: &[u8]) -> Result<bool>;
    fn vault(&self, vault_id: &[u8]) -> Result<Option<IStoredVault>>;
    fn configure_vault(
        &self,
        vault_id: &[u8],
        state: &IStoredVault,
        writes: &[IStateWrite],
        setup_token_hash: Option<&[u8]>,
    ) -> Result<()>;
    fn discard_inactive_vault(&self, vault_id: &[u8]) -> Result<()>;
    fn find_committed(&self, vault_id: &[u8], digest: &[u8]) -> Result<bool>;
    fn has_blob(&self, vault_id: &[u8], hash: &[u8]) -> Result<bool>;
    fn head(&self, vault_id: &[u8]) -> Result<Option<Vec<u8>>>;
    fn commit_swap(
        &self,
        vault_id: &[u8],
        expected_head: Option<&[u8]>,
        swap: &IStoredSwap,
        now: u64,
    ) -> Result<TCommitResult>;
    fn headers(
        &self,
        vault_id: &[u8],
        from_seq: u64,
        to_seq: u64,
        limit: Option<usize>,
        max_bytes: Option<usize>,
    ) -> Result<Vec<IStoredHeader>>;
    fn headers_for_files(&self, vault_id: &[u8], hash: &[u8]) -> Result<Vec<IStoredHeader>>;
    fn header(&self, vault_id: &[u8], hash: &[u8]) -> Result<Option<IStoredHeader>>;
    fn entries(
        &self,
        vault_id: &[u8],
        from_seq: u64,
        to_seq: u64,
        limit: Option<usize>,
        max_bytes: Option<usize>,
    ) -> Result<Vec<IStoredHeader>>;
    fn put_file_list(&self, vault_id: &[u8], files: &IStoredFiles, now: u64) -> Result<()>;
    fn file_list(&self, vault_id: &[u8], hash: &[u8]) -> Result<Option<Vec<u8>>>;
    fn state(&self, vault_id: &[u8], kind: TStateKind, key: &[u8]) -> Result<Option<Vec<u8>>>;
    fn states(&self, vault_id: &[u8], kind: TStateKind) -> Result<Vec<IStateEntry>>;
    fn write_state(&self, vault_id: &[u8], writes: &[IStateWrite]) -> Result<()>;
    fn device(&self, vault_id: &[u8], device: &[u8]) -> Result<Option<IStoredDevice>>;
    fn put_device(&self, vault_id: &[u8], device: &[u8], state: &IStoredDevice) -> Result<()>;
    fn put_blob(
        &self,
        vault_id: &[u8],
        hash: &[u8],
        bytes: &[u8],
        verify: Option<TVerifyBlob<'_>>,
        now: Option<u64>,
        quota_bytes: Option<u64>,
    ) -> Result<()>;
    fn get_blob(&self, vault_id: &[u8], hash: &[u8]) -> Result<Option<Vec<u8>>>;
    fn blob_hashes(&self, vault_id: &[u8]) -> Result<Vec<Vec<u8>>>;
    fn vault_usage(&self, vault_id: &[u8]) -> Result<u64>;
    fn prune(&self, vault_id: &[u8], policy: &IHistoryPolicy, now: u64) -> Result<IPruneResult>;
    fn setup_token(&self) -> Result<Option<Vec<u8>>>;
    fn set_setup_token(&self, hash: &[u8]) -> Result<()>;
    fn put_session(&self, vault_id: &[u8], key: &ISessionKey, bytes: &[u8], now: u64)
    -> Result<()>;
    fn session(&self, vault_id: &[u8], key: &ISessionKey, now: u64) -> Result<Option<Vec<u8>>>;
    fn consume_session(
        &self,
        vault_id: &[u8],
        key: &ISessionKey,
        now: u64,
    ) -> Result<Option<Vec<u8>>>;
    fn charge(&self, vault_id: &[u8], bucket: &TRateBucket, now: u64) -> Result<TRateCharge>;
    fn refund(&self, receipt: &str, now: u64) -> Result<bool>;
    fn open_mailbox(
        &self,
        vault_id: &[u8],
        device: &[u8],
        now: u64,
    ) -> Result<Option<IStoredMailbox>>;
    fn mailbox(&self, vault_id: &[u8], number: u64, now: u64) -> Result<Option<IStoredMailbox>>;
    fn write_mailbox(
        &self,
        vault_id: &[u8],
        number: u64,
        slot: TMailboxSlot,
        bytes: &[u8],
        now: u64,
    ) -> Result<TMailboxWrite>;
    fn close_mailbox(&self, vault_id: &[u8], number: u64) -> Result<()>;
    fn approver(&self, vault_id: &[u8], device: &[u8], now: u64) -> Result<Option<Vec<u8>>>;
    fn remember_nonce(&self, device: &[u8], nonce: &[u8], now: u64) -> Result<bool>;
}
