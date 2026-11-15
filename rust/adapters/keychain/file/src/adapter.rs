use crate::files;
use envden_core::{
    adapters::IKeychainAdapter,
    errors::{EnvdenError, ErrorCode, Result},
};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};

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
        let entries = match fs::read_dir(&self.directory) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(true),
            Err(e) => return Err(files::failure(e)),
        };
        let mut paths = vec![self.directory.clone()];
        for entry in entries {
            paths.push(entry.map_err(files::failure)?.path());
        }
        for path in paths {
            let _info = fs::metadata(path).map_err(files::failure)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if _info.permissions().mode() & 0o077 != 0 {
                    return Ok(false);
                }
            }
        }
        Ok(true)
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
