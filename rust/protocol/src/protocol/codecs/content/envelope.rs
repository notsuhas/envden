use crate::protocol::encoding::*;
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IEnvelope {
    pub vault_id: [u8; 32],
    pub recovery_enc_sk: [u8; 32],
    pub recovery_obj_sk: [u8; 32],
    pub checkpoint: [u8; 32],
    pub sealed_at: u64,
}

impl IEnvelope {
    fn validate(&self) -> Result<()> {
        Ok(())
    }
}

impl ICodec for IEnvelope {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.tagged(5)?;
        let value = Self {
            vault_id: r.fixed()?,
            recovery_enc_sk: r.fixed()?,
            recovery_obj_sk: r.fixed()?,
            checkpoint: r.fixed()?,
            sealed_at: r.u64()?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend([5, 1]);
        out.extend(self.vault_id);
        out.extend(self.recovery_enc_sk);
        out.extend(self.recovery_obj_sk);
        out.extend(self.checkpoint);
        out.extend(self.sealed_at.to_be_bytes());
        Ok(())
    }
}
