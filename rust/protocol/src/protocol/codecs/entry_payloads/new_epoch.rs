use crate::protocol::{codecs::IEpochChange, encoding::*};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct INewEpoch {
    pub change: IEpochChange,
}

impl INewEpoch {
    fn validate(&self) -> Result<()> {
        Ok(())
    }
}

impl ICodec for INewEpoch {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            change: IEpochChange::read(r)?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        self.change.write(out)?;
        Ok(())
    }
}
