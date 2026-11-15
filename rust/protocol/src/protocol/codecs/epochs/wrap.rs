use crate::protocol::encoding::*;
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IWrap {
    pub recipient: [u8; 16],
    pub enc: [u8; 32],
    pub ct: Vec<u8>,
}

impl IWrap {
    fn validate(&self) -> Result<()> {
        require_value(self.ct.len() == 48, "Invalid wrap ciphertext")?;
        Ok(())
    }
}

impl ICodec for IWrap {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            recipient: r.fixed()?,
            enc: r.fixed()?,
            ct: r.sized(65536)?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend(self.recipient);
        out.extend(self.enc);
        sized(&self.ct, 65536, out)?;
        Ok(())
    }
}
