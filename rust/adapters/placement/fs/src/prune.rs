use crate::native;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use rustix::fs::*;
use std::{fs, path::Path};

pub fn prune_backups(dir: &Path, now: f64, max_age_days: Option<f64>) -> Result<()> {
    let age = max_age_days.unwrap_or(30.0);
    if !now.is_finite() || !age.is_finite() || age < 0.0 {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Invalid backup retention",
        ));
    }
    let info = match dir.symlink_metadata() {
        Ok(info) => info,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(native::failure(e)),
    };
    if !info.is_dir() || info.is_symlink() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe backup directory",
        ));
    }
    let cutoff = now - age * 86400000.0;
    let fd = native::parent(dir, Path::new(".entry"), false)?;
    let pattern = regex::Regex::new(r"^\.envden-backup-(\d+)-[0-9a-f-]{36}$").unwrap();
    for entry in fs::read_dir(dir).map_err(native::failure)? {
        let name = entry
            .map_err(native::failure)?
            .file_name()
            .to_string_lossy()
            .into_owned();
        let Some(captures) = pattern.captures(&name) else {
            continue;
        };
        if captures[1].parse::<f64>().unwrap_or(f64::INFINITY) >= cutoff {
            continue;
        }
        let before = native::identity(&fd, &name)?;
        if before.is_none() || readlinkat(&fd, &name, Vec::new()).is_ok() {
            continue;
        }
        let file = openat(
            &fd,
            &name,
            OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK,
            Mode::empty(),
        )
        .map_err(native::failure)?;
        if FileType::from_raw_mode(fstat(&file).map_err(native::failure)?.st_mode)
            != FileType::RegularFile
        {
            continue;
        }
        native::assert_identity(&fd, &name, &before)?;
        unlinkat(&fd, &name, AtFlags::empty()).map_err(native::failure)?;
    }
    Ok(())
}
