use crate::protocol::{codecs::IFileEntry, encoding::*};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IFiles {
    pub entries: Vec<IFileEntry>,
}

impl IFiles {
    fn validate(&self) -> Result<()> {
        sorted(&self.entries, |v| v.file_id)?;
        Ok(())
    }
}

impl ICodec for IFiles {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.tagged(3)?;
        let value = Self { entries: r.list()? };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend([3, 1]);
        list(&self.entries, out)?;
        Ok(())
    }
}
