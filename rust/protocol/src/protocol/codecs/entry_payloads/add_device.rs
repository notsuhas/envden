use crate::protocol::{
    codecs::{IDeviceRecord, IWrap},
    encoding::*,
};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IAddDevice {
    pub device: IDeviceRecord,
    pub wrap: IWrap,
}

impl IAddDevice {
    fn validate(&self) -> Result<()> {
        Ok(())
    }
}

impl ICodec for IAddDevice {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            device: IDeviceRecord::read(r)?,
            wrap: IWrap::read(r)?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        self.device.write(out)?;
        self.wrap.write(out)?;
        Ok(())
    }
}
