use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

pub fn failure(error: std::io::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::Internal, "State file operation failed", error)
}

pub fn private_directory(path: &Path) -> Result<()> {
    fs::create_dir_all(path).map_err(failure)?;
    let info = fs::symlink_metadata(path).map_err(failure)?;
    if !info.is_dir() || info.is_symlink() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe state directory",
        ));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(failure)?;
    }
    Ok(())
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
    private_directory(parent)?;
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
