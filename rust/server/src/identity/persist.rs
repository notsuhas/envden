use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::Path,
};

pub(super) fn io_error(error: std::io::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::Internal, "Server identity I/O failed", error)
}

pub(super) fn restrict(path: &Path, directory: bool) -> Result<()> {
    envden_core::process::restrict_access(path, directory)
}

pub(super) fn persist_identity(directory: &Path, data: &[u8]) -> Result<()> {
    let temporary = directory.join(format!(".identity-{}", uuid::Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temporary).map_err(io_error)?;
    file.write_all(data).map_err(io_error)?;
    file.sync_all().map_err(io_error)?;
    drop(file);
    let result = (|| {
        fs::hard_link(&temporary, directory.join("identity.json")).map_err(io_error)?;
        #[cfg(unix)]
        File::open(directory)
            .and_then(|dir| dir.sync_all())
            .map_err(io_error)?;

        Ok(())
    })();
    let removed = fs::remove_file(temporary).map_err(io_error);

    result.and(removed)
}
