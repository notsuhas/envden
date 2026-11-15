use crate::protocol::{
    codecs::{IEpochChange, IRecoveryRecord},
    encoding::*,
};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IReplaceRecovery {
    pub recovery: IRecoveryRecord,
    pub change: IEpochChange,
}

impl IReplaceRecovery {
    fn validate(&self) -> Result<()> {
        Ok(())
    }
}

impl ICodec for IReplaceRecovery {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            recovery: IRecoveryRecord::read(r)?,
            change: IEpochChange::read(r)?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        self.recovery.write(out)?;
        self.change.write(out)?;
        Ok(())
    }
}
