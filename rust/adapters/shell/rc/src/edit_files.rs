use crate::edit::failure;
#[cfg(windows)]
use crate::edit::same;
#[cfg(windows)]
use envden_core::filesystem::path_identity;
use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    filesystem::IFileIdentity,
};
#[cfg(unix)]
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};
pub(crate) fn backup_rc(directory: &Path, bytes: &[u8]) -> Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    builder.mode(0o700);
    builder.create(directory).map_err(failure)?;
    #[cfg(windows)]
    {
        crate::windows::verify_owner(directory)?;
        envden_core::process::restrict_access(directory, true)?;
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000 | 0x02000000);
    }
    let folder = options.open(directory).map_err(failure)?;
    let info = folder.metadata().map_err(failure)?;
    #[cfg(unix)]
    let owned = info.uid() == rustix::process::getuid().as_raw() && info.mode() & 0o077 == 0;
    #[cfg(windows)]
    let owned = true;
    if !info.is_dir() || !owned {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe shell backup directory",
        ));
    }
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options
        .open(directory.join(format!(".envden-backup-{}", uuid::Uuid::new_v4())))
        .map_err(failure)?;
    file.write_all(bytes).map_err(failure)?;
    file.sync_all().map_err(failure)
}

pub(crate) fn replace(
    temporary: &Path,
    destination: &Path,
    expected: &IFileIdentity,
) -> Result<()> {
    match fs::rename(temporary, destination) {
        Ok(()) => Ok(()),
        Err(cause) => {
            #[cfg(windows)]
            {
                let current = fs::symlink_metadata(destination).map_err(failure)?;
                if cause.raw_os_error() == Some(5)
                    && current.permissions().readonly()
                    && same(&path_identity(destination).map_err(failure)?, expected)
                {
                    let original = current.permissions();
                    let mut writable = original.clone();
                    #[allow(
                        clippy::permissions_set_readonly_false,
                        reason = "This Windows-only branch clears FILE_ATTRIBUTE_READONLY, not Unix mode bits."
                    )]
                    writable.set_readonly(false);
                    fs::set_permissions(destination, writable).map_err(failure)?;
                    if let Err(error) = fs::rename(temporary, destination) {
                        fs::set_permissions(destination, original).map_err(failure)?;
                        return Err(failure(error));
                    }
                    return Ok(());
                }
            }
            #[cfg(unix)]
            let _ = expected;
            Err(failure(cause))
        }
    }
}
