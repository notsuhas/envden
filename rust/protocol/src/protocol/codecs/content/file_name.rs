use crate::protocol::{encoding::*, files::validate_path};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IFileName {
    pub repo_id: String,
    pub path: String,
}

impl IFileName {
    fn validate(&self) -> Result<()> {
        validate_path(&self.path)?;
        Ok(())
    }
}

impl ICodec for IFileName {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.tagged(13)?;
        let value = Self {
            repo_id: String::read(r)?,
            path: String::read(r)?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend([13, 1]);
        self.repo_id.write(out)?;
        self.path.write(out)?;
        Ok(())
    }
}
