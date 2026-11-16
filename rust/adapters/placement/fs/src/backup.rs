use crate::{native, paths};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_core::filesystem::ICanonicalPath;
use rustix::fs::{Mode, fchmod};
use std::{fs, path::Path};

pub(crate) fn backup(
    root: &Path,
    directory: Option<&Path>,
    contents: &[u8],
    now: f64,
) -> Result<()> {
    let now = envden_core::text::js_number(now);
    let directory = directory
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidInput, "Backup directory is required"))?;
    let path = paths::absolute(directory);
    let outside = |r: &Path, p: &Path| {
        if p.starts_with(r) {
            Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Backup directory must be outside checkout",
            ))
        } else {
            Ok(())
        }
    };
    outside(root, &path)?;
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(&path).map_err(native::failure)?;
    outside(
        &root.canonical_path().map_err(native::failure)?,
        &path.canonical_path().map_err(native::failure)?,
    )?;
    let name = format!(".envden-backup-{now}-{}", uuid::Uuid::new_v4());
    let fd = native::parent(&path, Path::new(&name), false)?;
    fchmod(&fd, Mode::from_raw_mode(0o700)).map_err(native::failure)?;
    native::write(&fd, &name, contents)
}
