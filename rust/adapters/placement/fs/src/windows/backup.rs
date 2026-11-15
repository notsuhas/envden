use super::state;
use envden_core::filesystem::ICanonicalPath;
use envden_core::{
    errors::Result,
    paths::{TRootPlacement, place_in_root_windows},
    process::restrict_access,
};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

pub(super) fn backup(
    root: &Path,
    directory: Option<&Path>,
    contents: &[u8],
    now: f64,
) -> Result<()> {
    let directory = directory.ok_or_else(|| state::invalid("Backup directory is required"))?;
    let path = crate::paths::absolute(directory);
    let outside = |r: &Path, p: &Path| {
        if place_in_root_windows(&r.to_string_lossy(), &p.to_string_lossy())
            == TRootPlacement::Outside
        {
            Ok(())
        } else {
            Err(state::invalid("Backup directory must be outside checkout"))
        }
    };
    outside(root, &path)?;
    fs::create_dir_all(&path).map_err(state::failure)?;
    outside(
        &root.canonical_path().map_err(state::failure)?,
        &path.canonical_path().map_err(state::failure)?,
    )?;
    let info = path.symlink_metadata().map_err(state::failure)?;
    if !info.is_dir() || info.is_symlink() {
        return Err(state::invalid("Unsafe backup directory"));
    }
    restrict_access(&path, true).map_err(|_| state::invalid("Could not restrict backup access"))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path.join(format!(".envden-backup-{now}-{}", uuid::Uuid::new_v4())))
        .map_err(state::failure)?;
    file.write_all(contents).map_err(state::failure)
}
