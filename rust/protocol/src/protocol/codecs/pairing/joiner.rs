use crate::protocol::{codecs::IDeviceRecord, encoding::*};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IPairJoiner {
    pub device: IDeviceRecord,
}

impl IPairJoiner {
    fn validate(&self) -> Result<()> {
        Ok(())
    }
}

impl ICodec for IPairJoiner {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.tagged(7)?;
        let value = Self {
            device: IDeviceRecord::read(r)?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend([7, 1]);
        self.device.write(out)?;
        Ok(())
    }
}
