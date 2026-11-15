use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

pub fn failure(error: std::io::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::Internal, "State file operation failed", error)
}

static OWNED: OnceLock<Mutex<Vec<PathBuf>>> = OnceLock::new();

fn prepare_directory(path: &Path) -> Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(path).map_err(failure)?;
    let info = fs::symlink_metadata(path).map_err(failure)?;
    if !info.is_dir() || info.is_symlink() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe state directory",
        ));
    }
    Ok(())
}

pub fn private_directory(path: &Path) -> Result<()> {
    prepare_directory(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(failure)?;
    }
    OWNED
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .push(absolute(path)?);
    Ok(())
}

fn absolute(path: &Path) -> Result<PathBuf> {
    std::path::absolute(path).map_err(failure)
}

pub fn optional_read(path: &Path) -> Result<Option<String>> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(failure(e)),
        Ok(info) if !info.is_file() || info.is_symlink() => {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Unsafe state file",
            ));
        }
        Ok(_) => {}
    }
    fs::read_to_string(path).map(Some).map_err(failure)
}

pub fn atomic_write(path: &Path, bytes: &[u8], now: u64) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidInput, "Unsafe state directory"))?;
    let resolved = absolute(parent)?;
    let owned = OWNED
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .iter()
        .any(|root| resolved.starts_with(root));
    if owned {
        private_directory(parent)?;
    } else {
        prepare_directory(parent)?;
    }
    let temporary = parent.join(format!(".{now:013}_{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(failure)?;
        file.write_all(bytes).map_err(failure)?;
        file.sync_all().map_err(failure)?;
        drop(file);
        fs::rename(&temporary, path).map_err(failure)?;
        #[cfg(unix)]
        fs::File::open(parent)
            .and_then(|f| f.sync_all())
            .map_err(failure)?;
        Ok(())
    })();
    let _ = fs::remove_file(temporary);
    result
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn atomic_write_preserves_external_parent_permissions() {
        let dir = tempfile::tempdir().unwrap();
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o755)).unwrap();
        atomic_write(&dir.path().join("restored"), b"content", 1).unwrap();
        assert_eq!(
            fs::metadata(dir.path()).unwrap().permissions().mode() & 0o777,
            0o755
        );
        private_directory(dir.path()).unwrap();
        let nested = dir.path().join("nested");
        fs::create_dir(&nested).unwrap();
        fs::set_permissions(&nested, fs::Permissions::from_mode(0o755)).unwrap();
        atomic_write(&nested.join("state"), b"content", 1).unwrap();
        assert_eq!(
            fs::metadata(nested).unwrap().permissions().mode() & 0o777,
            0o700
        );
    }
}
