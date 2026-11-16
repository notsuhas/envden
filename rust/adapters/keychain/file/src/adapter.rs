use crate::files;
use envden_core::{
    adapters::IKeychainAdapter,
    errors::{EnvdenError, ErrorCode, Result},
};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub struct FileKeychainAdapter {
    directory: PathBuf,
}

pub fn create_file_keychain_adapter(home: impl AsRef<Path>) -> FileKeychainAdapter {
    FileKeychainAdapter {
        directory: home.as_ref().join("state/keys"),
    }
}

impl FileKeychainAdapter {
    fn path(&self, name: &str) -> PathBuf {
        self.directory
            .join(format!("{:x}.key", Sha256::digest(name.as_bytes())))
    }
}

impl IKeychainAdapter for FileKeychainAdapter {
    fn id(&self) -> &str {
        "file"
    }
    fn owner_only(&self) -> Result<bool> {
        files::owner_only(&self.directory)
    }
    fn get(&self, name: &str, required: bool) -> Result<Option<Vec<u8>>> {
        let value = files::read(&self.path(name))?;
        if value.is_none() && required {
            return Err(EnvdenError::new(
                ErrorCode::Locked,
                "No vault keys are stored on this device. If it was in the vault before, run envden join",
            ));
        }
        Ok(value)
    }
    fn set(&self, name: &str, value: &[u8]) -> Result<()> {
        files::write(&self.path(name), value)
    }
    fn delete(&self, name: &str) -> Result<()> {
        files::delete(&self.path(name))
    }
}
