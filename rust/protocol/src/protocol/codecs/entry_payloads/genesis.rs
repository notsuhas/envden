use crate::protocol::{
    codecs::{IDeviceRecord, IRecoveryRecord},
    encoding::*,
};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IGenesis {
    pub server_pin: [u8; 32],
    pub device: IDeviceRecord,
    pub recovery: IRecoveryRecord,
    pub vault_nonce: [u8; 32],
    pub created_at: u64,
}

impl IGenesis {
    fn validate(&self) -> Result<()> {
        Ok(())
    }
}

impl ICodec for IGenesis {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            server_pin: r.fixed()?,
            device: IDeviceRecord::read(r)?,
            recovery: IRecoveryRecord::read(r)?,
            vault_nonce: r.fixed()?,
            created_at: r.u64()?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend(self.server_pin);
        self.device.write(out)?;
        self.recovery.write(out)?;
        out.extend(self.vault_nonce);
        out.extend(self.created_at.to_be_bytes());
        Ok(())
    }
}
