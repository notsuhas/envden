use crate::protocol::encoding::*;
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IRenameDevice {
    pub device: [u8; 16],
    pub name: String,
}

impl IRenameDevice {
    fn validate(&self) -> Result<()> {
        require_value(is_device_name(&self.name), "Invalid device name")?;
        Ok(())
    }
}

impl ICodec for IRenameDevice {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            device: r.fixed()?,
            name: String::read(r)?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend(self.device);
        self.name.write(out)?;
        Ok(())
    }
}
