use envden_core::{adapters::*, errors::Result};
pub type TClose = Box<dyn Fn() -> Result<()> + Send + Sync>;
pub type TTransaction = Box<dyn Fn(&mut dyn FnMut() -> Result<()>) -> Result<()> + Send + Sync>;
pub type TVaultIds = Box<dyn Fn() -> Result<Vec<Vec<u8>>> + Send + Sync>;
pub type TCapUnlocks = Box<dyn Fn(&[u8], u64) -> Result<()> + Send + Sync>;
pub type THasVault = Box<dyn Fn(&[u8]) -> Result<bool> + Send + Sync>;
pub type TVault = Box<dyn Fn(&[u8]) -> Result<Option<IStoredVault>> + Send + Sync>;
pub type TConfigureVault =
    Box<dyn Fn(&[u8], &IStoredVault, &[IStateWrite], Option<&[u8]>) -> Result<()> + Send + Sync>;
pub type TDiscardInactiveVault = Box<dyn Fn(&[u8]) -> Result<()> + Send + Sync>;
pub type TFindCommitted = Box<dyn Fn(&[u8], &[u8]) -> Result<bool> + Send + Sync>;
pub type THasBlob = Box<dyn Fn(&[u8], &[u8]) -> Result<bool> + Send + Sync>;
pub type THead = Box<dyn Fn(&[u8]) -> Result<Option<Vec<u8>>> + Send + Sync>;
pub type TCommitSwap =
    Box<dyn Fn(&[u8], Option<&[u8]>, &IStoredSwap, u64) -> Result<TCommitResult> + Send + Sync>;
pub type THeaders = Box<
    dyn Fn(&[u8], u64, u64, Option<usize>, Option<usize>) -> Result<Vec<IStoredHeader>>
        + Send
        + Sync,
>;
pub type THeadersForFiles = Box<dyn Fn(&[u8], &[u8]) -> Result<Vec<IStoredHeader>> + Send + Sync>;
pub type THeader = Box<dyn Fn(&[u8], &[u8]) -> Result<Option<IStoredHeader>> + Send + Sync>;
pub type TEntries = Box<
    dyn Fn(&[u8], u64, u64, Option<usize>, Option<usize>) -> Result<Vec<IStoredHeader>>
        + Send
        + Sync,
>;
pub type TPutFileList = Box<dyn Fn(&[u8], &IStoredFiles, u64) -> Result<()> + Send + Sync>;
pub type TFileList = Box<dyn Fn(&[u8], &[u8]) -> Result<Option<Vec<u8>>> + Send + Sync>;
pub type TState = Box<dyn Fn(&[u8], TStateKind, &[u8]) -> Result<Option<Vec<u8>>> + Send + Sync>;
pub type TStates = Box<dyn Fn(&[u8], TStateKind) -> Result<Vec<IStateEntry>> + Send + Sync>;
pub type TWriteState = Box<dyn Fn(&[u8], &[IStateWrite]) -> Result<()> + Send + Sync>;
pub type TDevice = Box<dyn Fn(&[u8], &[u8]) -> Result<Option<IStoredDevice>> + Send + Sync>;
pub type TPutDevice = Box<dyn Fn(&[u8], &[u8], &IStoredDevice) -> Result<()> + Send + Sync>;
pub type TPutBlob = Box<
    dyn Fn(&[u8], &[u8], &[u8], Option<TVerifyBlob<'_>>, Option<u64>, Option<u64>) -> Result<()>
        + Send
        + Sync,
>;
pub type TGetBlob = Box<dyn Fn(&[u8], &[u8]) -> Result<Option<Vec<u8>>> + Send + Sync>;
pub type TBlobHashes = Box<dyn Fn(&[u8]) -> Result<Vec<Vec<u8>>> + Send + Sync>;
pub type TVaultUsage = Box<dyn Fn(&[u8]) -> Result<u64> + Send + Sync>;
pub type TPrune = Box<dyn Fn(&[u8], &IHistoryPolicy, u64) -> Result<IPruneResult> + Send + Sync>;
pub type TSetupToken = Box<dyn Fn() -> Result<Option<Vec<u8>>> + Send + Sync>;
pub type TSetSetupToken = Box<dyn Fn(&[u8]) -> Result<()> + Send + Sync>;
pub type TPutSession = Box<dyn Fn(&[u8], &ISessionKey, &[u8], u64) -> Result<()> + Send + Sync>;
pub type TSession = Box<dyn Fn(&[u8], &ISessionKey, u64) -> Result<Option<Vec<u8>>> + Send + Sync>;
pub type TConsumeSession =
    Box<dyn Fn(&[u8], &ISessionKey, u64) -> Result<Option<Vec<u8>>> + Send + Sync>;
pub type TCharge = Box<dyn Fn(&[u8], &TRateBucket, u64) -> Result<TRateCharge> + Send + Sync>;
pub type TRefund = Box<dyn Fn(&str, u64) -> Result<bool> + Send + Sync>;
pub type TOpenMailbox =
    Box<dyn Fn(&[u8], &[u8], u64) -> Result<Option<IStoredMailbox>> + Send + Sync>;
pub type TMailbox = Box<dyn Fn(&[u8], u64, u64) -> Result<Option<IStoredMailbox>> + Send + Sync>;
pub type TWriteMailbox =
    Box<dyn Fn(&[u8], u64, TMailboxSlot, &[u8], u64) -> Result<TMailboxWrite> + Send + Sync>;
pub type TCloseMailbox = Box<dyn Fn(&[u8], u64) -> Result<()> + Send + Sync>;
pub type TApprover = Box<dyn Fn(&[u8], &[u8], u64) -> Result<Option<Vec<u8>>> + Send + Sync>;
pub type TRememberNonce = Box<dyn Fn(&[u8], &[u8], u64) -> Result<bool> + Send + Sync>;
