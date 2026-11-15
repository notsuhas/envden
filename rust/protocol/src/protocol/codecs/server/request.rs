use crate::protocol::{encoding::*, versions::parse_semver};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IRequest {
    pub server_pin: [u8; 32],
    pub vault_id: [u8; 32],
    pub method: String,
    pub path_and_query: String,
    pub body_hash: [u8; 32],
    pub time: u64,
    pub nonce: [u8; 16],
    pub device: [u8; 16],
    pub client_version: String,
}

impl IRequest {
    fn validate(&self) -> Result<()> {
        parse_semver(&self.client_version)?;
        Ok(())
    }
}

impl ICodec for IRequest {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.tagged(9)?;
        let value = Self {
            server_pin: r.fixed()?,
            vault_id: r.fixed()?,
            method: String::read(r)?,
            path_and_query: String::read(r)?,
            body_hash: r.fixed()?,
            time: r.u64()?,
            nonce: r.fixed()?,
            device: r.fixed()?,
            client_version: String::read(r)?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend([9, 1]);
        out.extend(self.server_pin);
        out.extend(self.vault_id);
        self.method.write(out)?;
        self.path_and_query.write(out)?;
        out.extend(self.body_hash);
        out.extend(self.time.to_be_bytes());
        out.extend(self.nonce);
        out.extend(self.device);
        self.client_version.write(out)?;
        Ok(())
    }
}
