use super::*;
use crate::protocol::encoding::*;
use envden_core::errors::{EnvdenError, ErrorCode, Result};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum TEntryPayload {
    Genesis(IGenesis),
    AddDevice(IAddDevice),
    RemoveDevice(IRemoveDevice),
    NewEpoch(INewEpoch),
    ReplaceRecovery(IReplaceRecovery),
    ServerMoved(IServerMoved),
    RepairDone(IRepairDone),
    RenameDevice(IRenameDevice),
}

impl ICodec for TEntryPayload {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        Ok(match r.u8()? {
            0 => Self::Genesis(IGenesis::read(r)?),
            1 => Self::AddDevice(IAddDevice::read(r)?),
            2 => Self::RemoveDevice(IRemoveDevice::read(r)?),
            3 => Self::NewEpoch(INewEpoch::read(r)?),
            4 => Self::ReplaceRecovery(IReplaceRecovery::read(r)?),
            5 => Self::ServerMoved(IServerMoved::read(r)?),
            6 => Self::RepairDone(IRepairDone::read(r)?),
            7 => Self::RenameDevice(IRenameDevice::read(r)?),
            _ => {
                return Err(EnvdenError::new(
                    ErrorCode::UpdateRequired,
                    "Unknown entry kind",
                ));
            }
        })
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        match self {
            Self::Genesis(v) => {
                out.push(0);
                v.write(out)
            }
            Self::AddDevice(v) => {
                out.push(1);
                v.write(out)
            }
            Self::RemoveDevice(v) => {
                out.push(2);
                v.write(out)
            }
            Self::NewEpoch(v) => {
                out.push(3);
                v.write(out)
            }
            Self::ReplaceRecovery(v) => {
                out.push(4);
                v.write(out)
            }
            Self::ServerMoved(v) => {
                out.push(5);
                v.write(out)
            }
            Self::RepairDone(v) => {
                out.push(6);
                v.write(out)
            }
            Self::RenameDevice(v) => {
                out.push(7);
                v.write(out)
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TEntry {
    pub vault_id: [u8; 32],
    pub seq: u64,
    pub parent: [u8; 32],
    pub change: TEntryPayload,
    pub signer: [u8; 16],
}

impl ICodec for TEntry {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.tagged(1)?;
        Ok(Self {
            vault_id: r.fixed()?,
            seq: r.u64()?,
            parent: r.fixed()?,
            change: TEntryPayload::read(r)?,
            signer: r.fixed()?,
        })
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        out.extend([1, 1]);
        out.extend(self.vault_id);
        out.extend(self.seq.to_be_bytes());
        out.extend(self.parent);
        self.change.write(out)?;
        out.extend(self.signer);
        Ok(())
    }
}
