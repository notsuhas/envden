use crate::{chain::devices::IDeviceListState, protocol::*};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub trait IChainSource {
    fn header(&self, hash: &[u8; 32]) -> Result<Option<ISigned<IManifestHeader>>>;
    fn entry(&self, hash: &[u8; 32]) -> Result<Option<ISigned<TEntry>>>;
    fn files(&self, hash: &[u8; 32]) -> Result<Option<IFiles>>;
    fn keyring(&self, hash: &[u8; 32]) -> Result<Option<Vec<u8>>>;
    fn epoch_key(&self, epoch: u32) -> Result<Option<[u8; 32]>>;
}

#[derive(Debug, Clone)]
pub struct ICheckpoint {
    pub header: ISigned<IManifestHeader>,
    pub files: IFiles,
    pub state: IDeviceListState,
    pub id_key: [u8; 32],
}
pub(crate) fn source_value<T>(v: Result<T>) -> Result<T> {
    v.map_err(|e| EnvdenError::with_source(ErrorCode::Internal, "Chain source failed", e))
}
pub(crate) fn needed<T>(v: Option<T>) -> Result<T> {
    v.ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Invalid chain data"))
}
