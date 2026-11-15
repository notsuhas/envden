use crate::protocol::encoding::*;
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IOlderKey {
    pub epoch: u32,
    pub key: [u8; 32],
}

impl IOlderKey {
    fn validate(&self) -> Result<()> {
        Ok(())
    }
}

impl ICodec for IOlderKey {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            epoch: r.u32()?,
            key: r.fixed()?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend(self.epoch.to_be_bytes());
        out.extend(self.key);
        Ok(())
    }
}
