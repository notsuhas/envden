use crate::protocol::encoding::*;
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IPairApprover {
    pub vault_id: [u8; 32],
    pub server_pin: [u8; 32],
    pub manifest_hash: [u8; 32],
}

impl IPairApprover {
    fn validate(&self) -> Result<()> {
        Ok(())
    }
}

impl ICodec for IPairApprover {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.tagged(8)?;
        let value = Self {
            vault_id: r.fixed()?,
            server_pin: r.fixed()?,
            manifest_hash: r.fixed()?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend([8, 1]);
        out.extend(self.vault_id);
        out.extend(self.server_pin);
        out.extend(self.manifest_hash);
        Ok(())
    }
}
