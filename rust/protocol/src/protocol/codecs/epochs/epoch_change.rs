use crate::protocol::{codecs::IWrap, encoding::*};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IEpochChange {
    pub epoch: u32,
    pub key_commit: [u8; 32],
    pub wraps: Vec<IWrap>,
}

impl IEpochChange {
    fn validate(&self) -> Result<()> {
        sorted(&self.wraps, |v| v.recipient)?;
        Ok(())
    }
}

impl ICodec for IEpochChange {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            epoch: r.u32()?,
            key_commit: r.fixed()?,
            wraps: r.list()?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend(self.epoch.to_be_bytes());
        out.extend(self.key_commit);
        list(&self.wraps, out)?;
        Ok(())
    }
}
