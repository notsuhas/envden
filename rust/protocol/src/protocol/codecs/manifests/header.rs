use crate::protocol::encoding::*;
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IManifestHeader {
    pub vault_id: [u8; 32],
    pub seq: u64,
    pub op: u8,
    pub prev: [u8; 32],
    pub list_seq: u64,
    pub list_head: [u8; 32],
    pub epoch: u32,
    pub keyring_hash: [u8; 32],
    pub files_hash: [u8; 32],
    pub envelope_hash: [u8; 32],
    pub created_at: u64,
    pub signer: [u8; 16],
}

impl IManifestHeader {
    fn validate(&self) -> Result<()> {
        if self.op > 13 {
            return Err(envden_core::errors::EnvdenError::new(
                envden_core::errors::ErrorCode::UpdateRequired,
                "Unknown operation",
            ));
        }
        Ok(())
    }
}

impl ICodec for IManifestHeader {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.tagged(2)?;
        let value = Self {
            vault_id: r.fixed()?,
            seq: r.u64()?,
            op: r.u8()?,
            prev: r.fixed()?,
            list_seq: r.u64()?,
            list_head: r.fixed()?,
            epoch: r.u32()?,
            keyring_hash: r.fixed()?,
            files_hash: r.fixed()?,
            envelope_hash: r.fixed()?,
            created_at: r.u64()?,
            signer: r.fixed()?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend([2, 1]);
        out.extend(self.vault_id);
        out.extend(self.seq.to_be_bytes());
        out.push(self.op);
        out.extend(self.prev);
        out.extend(self.list_seq.to_be_bytes());
        out.extend(self.list_head);
        out.extend(self.epoch.to_be_bytes());
        out.extend(self.keyring_hash);
        out.extend(self.files_hash);
        out.extend(self.envelope_hash);
        out.extend(self.created_at.to_be_bytes());
        out.extend(self.signer);
        Ok(())
    }
}
