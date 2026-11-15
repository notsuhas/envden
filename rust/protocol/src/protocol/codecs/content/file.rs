use crate::protocol::{encoding::*, files::validate_path};
use envden_core::errors::Result;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IFile {
    pub repo_id: String,
    pub path: String,
    pub content: Vec<u8>,
}

impl IFile {
    fn validate(&self) -> Result<()> {
        validate_path(&self.path)?;
        Ok(())
    }
}

impl ICodec for IFile {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        r.tagged(6)?;
        let value = Self {
            repo_id: String::read(r)?,
            path: String::read(r)?,
            content: r.sized(1048576)?,
        };
        value.validate()?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        self.validate()?;
        out.extend([6, 1]);
        self.repo_id.write(out)?;
        self.path.write(out)?;
        sized(&self.content, 1048576, out)?;
        Ok(())
    }
}
