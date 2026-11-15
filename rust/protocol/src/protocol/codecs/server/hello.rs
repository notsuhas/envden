use crate::protocol::{encoding::*, keys::validate_ed_public, versions::parse_semver};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IServerHello {
    pub challenge: [u8; 32],
    pub host: String,
    pub server_sign_pub: [u8; 32],
    pub app_version: String,
    pub min_client: String,
    pub protocols: Vec<u8>,
}

impl IServerHello {
    fn validate(&self) -> Result<()> {
        validate_ed_public(&self.server_sign_pub)?;
        parse_semver(&self.app_version)?;
        parse_semver(&self.min_client)?;
        require_value(
            self.host == self.host.to_lowercase(),
            "Invalid protocol data",
        )?;
        sorted(&self.protocols, |v| *v)?;
        Ok(())
    }
}

impl ICodec for IServerHello {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.tagged(10)?;
        let value = Self {
            challenge: r.fixed()?,
            host: String::read(r)?,
            server_sign_pub: r.fixed()?,
            app_version: String::read(r)?,
            min_client: String::read(r)?,
            protocols: r.list()?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend([10, 1]);
        out.extend(self.challenge);
        self.host.write(out)?;
        out.extend(self.server_sign_pub);
        self.app_version.write(out)?;
        self.min_client.write(out)?;
        list(&self.protocols, out)?;
        Ok(())
    }
}
