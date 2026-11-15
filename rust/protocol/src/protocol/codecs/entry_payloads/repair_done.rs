use crate::protocol::encoding::*;
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IRepairDone {
    pub repair_id: [u8; 32],
    pub restored_head: [u8; 32],
}

impl IRepairDone {
    fn validate(&self) -> Result<()> {
        Ok(())
    }
}

impl ICodec for IRepairDone {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            repair_id: r.fixed()?,
            restored_head: r.fixed()?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend(self.repair_id);
        out.extend(self.restored_head);
        Ok(())
    }
}
