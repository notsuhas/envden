use crate::protocol::{
    encoding::*,
    keys::{recovery_id, validate_ed_public, validate_enc_public},
};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IRecoveryRecord {
    pub id: [u8; 16],
    pub enc_pub: [u8; 32],
    pub obj_pub: [u8; 32],
}

impl IRecoveryRecord {
    fn validate(&self) -> Result<()> {
        validate_enc_public(&self.enc_pub)?;
        validate_ed_public(&self.obj_pub)?;
        require_value(
            self.id == recovery_id(&self.enc_pub, &self.obj_pub),
            "Recovery ID mismatch",
        )?;
        Ok(())
    }
}

impl ICodec for IRecoveryRecord {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            id: r.fixed()?,
            enc_pub: r.fixed()?,
            obj_pub: r.fixed()?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend(self.id);
        out.extend(self.enc_pub);
        out.extend(self.obj_pub);
        Ok(())
    }
}
