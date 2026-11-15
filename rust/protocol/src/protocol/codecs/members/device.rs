use crate::protocol::{
    encoding::*,
    keys::{device_id, validate_ed_public, validate_enc_public},
};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IDeviceRecord {
    pub id: [u8; 16],
    pub name: String,
    pub enc_pub: [u8; 32],
    pub obj_pub: [u8; 32],
    pub req_pub: [u8; 32],
}

impl IDeviceRecord {
    fn validate(&self) -> Result<()> {
        require_value(is_device_name(&self.name), "Invalid device name")?;
        validate_enc_public(&self.enc_pub)?;
        validate_ed_public(&self.obj_pub)?;
        validate_ed_public(&self.req_pub)?;
        require_value(
            self.id == device_id(&self.enc_pub, &self.obj_pub, &self.req_pub),
            "Device ID mismatch",
        )?;
        Ok(())
    }
}

impl ICodec for IDeviceRecord {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = Self {
            id: r.fixed()?,
            name: String::read(r)?,
            enc_pub: r.fixed()?,
            obj_pub: r.fixed()?,
            req_pub: r.fixed()?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend(self.id);
        self.name.write(out)?;
        out.extend(self.enc_pub);
        out.extend(self.obj_pub);
        out.extend(self.req_pub);
        Ok(())
    }
}
