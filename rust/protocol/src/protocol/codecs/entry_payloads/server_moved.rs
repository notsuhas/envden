use crate::protocol::encoding::*;
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IServerMoved {
    pub old_pin: [u8; 32],
    pub new_pin: [u8; 32],
    pub new_address: String,
}

impl IServerMoved {
    fn validate(&self) -> Result<()> {
        Ok(())
    }
}

impl ICodec for IServerMoved {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            old_pin: r.fixed()?,
            new_pin: r.fixed()?,
            new_address: String::read(r)?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend(self.old_pin);
        out.extend(self.new_pin);
        self.new_address.write(out)?;
        Ok(())
    }
}
