use crate::protocol::encoding::*;
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IRepairReport {
    pub vault_id: [u8; 32],
    pub repair_id: [u8; 32],
    pub head: [u8; 32],
    pub blobs: Vec<[u8; 32]>,
    pub signer: [u8; 16],
}

impl IRepairReport {
    fn validate(&self) -> Result<()> {
        sorted(&self.blobs, |v| *v)?;
        Ok(())
    }
}

impl ICodec for IRepairReport {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.tagged(11)?;
        let value = Self {
            vault_id: r.fixed()?,
            repair_id: r.fixed()?,
            head: r.fixed()?,
            blobs: r.list()?,
            signer: r.fixed()?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend([11, 1]);
        out.extend(self.vault_id);
        out.extend(self.repair_id);
        out.extend(self.head);
        list(&self.blobs, out)?;
        out.extend(self.signer);
        Ok(())
    }
}
