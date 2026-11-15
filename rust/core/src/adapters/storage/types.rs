use std::collections::BTreeMap;
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct IStoredVault {
    pub active: bool,
    pub frozen: bool,
    pub server_moved: Option<Vec<u8>>,
    pub sk_refused: bool,
    pub unlock_period: Option<u64>,
    pub restored: Option<IRestoredVault>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IRestoredVault {
    pub repair_token_hash: Vec<u8>,
    pub restored_head: Vec<u8>,
    pub finish_progress: Option<Vec<u8>>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IStoredObject {
    pub hash: Vec<u8>,
    pub bytes: Vec<u8>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IStoredHeader {
    pub hash: Vec<u8>,
    pub bytes: Vec<u8>,
    pub seq: u64,
}
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct IStoredDevice {
    pub unlocked_until: u64,
    pub fresh_until: u64,
    pub client_version: String,
    pub mailbox_grant: Option<Vec<u8>>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum TStateKind {
    Keyring,
    Envelope,
    SkPub,
    OpaqueRecord,
    RepairReport,
    MoveSession,
    SetupIssued,
    ServerIdentity,
    PairingIndex,
    MailboxJoiner,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IStateWrite {
    pub kind: TStateKind,
    pub key: Vec<u8>,
    pub bytes: Option<Vec<u8>>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum TSessionKind {
    Login,
    JoinTicket,
}
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ISessionKey {
    pub kind: TSessionKind,
    pub device: Vec<u8>,
    pub purpose: String,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IFileVersion {
    pub file_id: Vec<u8>,
    pub version: u64,
    pub blob_hash: Option<Vec<u8>>,
    pub tombstone: bool,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IStoredFiles {
    pub hash: Vec<u8>,
    pub bytes: Vec<u8>,
    pub versions: Vec<IFileVersion>,
    pub retain_forever: Option<bool>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IDeviceWrite {
    pub id: Vec<u8>,
    pub state: IStoredDevice,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IApproverWrite {
    pub device: Vec<u8>,
    pub bytes: Vec<u8>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IStoredSwap {
    pub header: IStoredHeader,
    pub entries: Vec<IStoredHeader>,
    pub files_hash: Option<Vec<u8>>,
    pub files: Option<IStoredFiles>,
    pub body_digest: Vec<u8>,
    pub state: Option<Vec<IStateWrite>>,
    pub vault: Option<IStoredVault>,
    pub devices: Option<Vec<IDeviceWrite>>,
    pub approver: Option<IApproverWrite>,
    pub consume_sessions: Option<Vec<ISessionKey>>,
    pub close_mailbox: Option<u64>,
    pub setup_token_hash: Option<Vec<u8>>,
    pub clear_repair_reports: Option<bool>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TCommitResult {
    Committed,
    RetryOfCommitted,
    HeadMoved { head: Option<Vec<u8>> },
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IHistoryPolicy {
    pub max_age: u64,
    pub min_versions: usize,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IStoredMailbox {
    pub number: u64,
    pub device: Vec<u8>,
    pub expires_at: u64,
    pub slots: BTreeMap<TMailboxSlot, Vec<u8>>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum TMailboxSlot {
    KE1,
    KE2,
    KE3,
    PairJoiner,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TRateBucket {
    Member { device: Vec<u8> },
    NonMember,
    Mailbox { device: Option<Vec<u8>> },
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TRateCharge {
    Charged { receipt: String },
    Locked { until: u64 },
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TMailboxWrite {
    Written,
    Identical,
    Closed,
    OutOfOrder,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IPruneResult {
    pub lists: usize,
    pub blobs: usize,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IStateEntry {
    pub key: Vec<u8>,
    pub bytes: Vec<u8>,
}
pub type TVerifyBlob<'a> = &'a (dyn Fn(&[u8]) -> Vec<u8> + Send + Sync);
