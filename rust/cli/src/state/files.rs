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
    private_directory_with(path, &|path, directory| {
        envden_core::process::restrict_access(path, directory)
    })
}

fn private_directory_with(path: &Path, restrict: &dyn Fn(&Path, bool) -> Result<()>) -> Result<()> {
    prepare_directory(path)?;
    restrict(path, true)?;
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
    match fs::read(path) {
        Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).into_owned())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(failure(error)),
    }
}

pub fn atomic_write(path: &Path, bytes: &[u8], now: u64) -> Result<()> {
    atomic_write_with(path, bytes, now, &|path, directory| {
        envden_core::process::restrict_access(path, directory)
    })
}

fn atomic_write_with(
    path: &Path,
    bytes: &[u8],
    now: u64,
    restrict: &dyn Fn(&Path, bool) -> Result<()>,
) -> Result<()> {
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
        restrict(&temporary, false)?;
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
    match fs::remove_file(temporary) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(failure(error)),
    }
    result
}

#[cfg(test)]
#[path = "files/tests.rs"]
mod tests;
