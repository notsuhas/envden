use crate::protocol::encoding::*;
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IFileEntry {
    pub file_id: [u8; 32],
    pub version: u64,
    pub epoch: u32,
    pub state: u8,
    pub blob_hash: [u8; 32],
    pub name: Vec<u8>,
}

impl IFileEntry {
    fn validate(&self) -> Result<()> {
        require_value((1..=4).contains(&self.state), "Unknown file state")?;
        require_value(
            self.version >= 1 && self.epoch >= 1,
            "Invalid protocol data",
        )?;
        require_value(
            matches!(self.state, 2 | 4) == (self.blob_hash == [0; 32]),
            "Blob hash does not match file state",
        )?;
        Ok(())
    }
}

impl ICodec for IFileEntry {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            file_id: r.fixed()?,
            version: r.u64()?,
            epoch: r.u32()?,
            state: r.u8()?,
            blob_hash: r.fixed()?,
            name: r.sized(65536)?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend(self.file_id);
        out.extend(self.version.to_be_bytes());
        out.extend(self.epoch.to_be_bytes());
        out.push(self.state);
        out.extend(self.blob_hash);
        sized(&self.name, 65536, out)?;
        Ok(())
    }
}
