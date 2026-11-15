use crate::protocol::{
    codecs::{IEpochChange, IRecoveryRecord},
    encoding::*,
};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IRemoveDevice {
    pub device: [u8; 16],
    pub new_recovery: Option<IRecoveryRecord>,
    pub change: IEpochChange,
}

impl IRemoveDevice {
    fn validate(&self) -> Result<()> {
        Ok(())
    }
}

impl ICodec for IRemoveDevice {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            device: r.fixed()?,
            new_recovery: r.opt()?,
            change: IEpochChange::read(r)?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend(self.device);
        opt(&self.new_recovery, out)?;
        self.change.write(out)?;
        Ok(())
    }
}
