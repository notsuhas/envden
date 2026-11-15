use envden_core::errors::{EnvdenError, ErrorCode, Result};
use path_clean::PathClean;
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::{
    fs::{self, Metadata, OpenOptions},
    io::{Read, Write},
    path::Path,
};

pub(crate) fn failure(e: std::io::Error) -> EnvdenError {
    EnvdenError::with_source(
        ErrorCode::Internal,
        "Shell configuration operation failed",
        e,
    )
}

fn validate(info: &Metadata) -> Result<()> {
    if !info.is_file() || info.nlink() != 1 || info.uid() != rustix::process::getuid().as_raw() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe shell configuration file",
        ));
    }
    Ok(())
}

fn same(a: &Metadata, b: &Metadata) -> bool {
    a.dev() == b.dev()
        && a.ino() == b.ino()
        && a.len() == b.len()
        && a.mtime() == b.mtime()
        && a.mtime_nsec() == b.mtime_nsec()
        && a.ctime() == b.ctime()
        && a.ctime_nsec() == b.ctime_nsec()
}

pub(crate) fn edit(
    path: &Path,
    backup: Option<&Path>,
    transform: impl Fn(&str) -> String,
) -> Result<()> {
    let mut resolved = path.to_owned();
    let mut exists = false;
    for _ in 0..40 {
        match resolved.canonicalize() {
            Ok(p) => {
                resolved = p;
                exists = true;
                break;
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(failure(e)),
        }
        match fs::symlink_metadata(&resolved) {
            Ok(m) if m.is_symlink() => {
                resolved = resolved
                    .parent()
                    .unwrap()
                    .join(fs::read_link(&resolved).map_err(failure)?)
                    .clean()
            }
            Ok(_) => break,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => break,
            Err(e) => return Err(failure(e)),
        }
    }
    if !exists && transform("").is_empty() {
        return Ok(());
    }
    if !exists {
        fs::create_dir_all(resolved.parent().unwrap()).map_err(failure)?;
    }
    let mut options = OpenOptions::new();
    options
        .read(true)
        .custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32);
    if !exists {
        options.create_new(true).write(true).mode(0o600);
    }
    let mut file = options.open(&resolved).map_err(failure)?;
    let opened = file.metadata().map_err(failure)?;
    let stat = fs::symlink_metadata(&resolved).map_err(failure)?;
    validate(&opened)?;
    validate(&stat)?;
    if opened.dev() != stat.dev() || opened.ino() != stat.ino() {
        return Err(EnvdenError::new(
            ErrorCode::Conflict,
            "Shell configuration changed during editing",
        ));
    }
    let mut original = Vec::new();
    file.read_to_end(&mut original).map_err(failure)?;
    let current: String = original.iter().copied().map(char::from).collect();
    let next = transform(&current);
    if current == next {
        return Ok(());
    }
    if let Some(directory) = backup {
        backup_rc(directory, &original)?;
    }
    let temporary = resolved
        .parent()
        .unwrap()
        .join(format!(".envden-rc-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut replacement = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(stat.mode() & 0o777)
            .open(&temporary)
            .map_err(failure)?;
        replacement
            .set_permissions(fs::Permissions::from_mode(stat.mode() & 0o777))
            .map_err(failure)?;
        let bytes: Vec<u8> = next.chars().map(|c| c as u8).collect();
        replacement.write_all(&bytes).map_err(failure)?;
        replacement.sync_all().map_err(failure)?;
        drop(replacement);
        if !same(&fs::symlink_metadata(&resolved).map_err(failure)?, &stat) {
            return Err(EnvdenError::new(
                ErrorCode::Conflict,
                "Shell configuration changed during editing",
            ));
        }
        fs::rename(&temporary, &resolved).map_err(failure)
    })();
    match fs::remove_file(&temporary) {
        Ok(()) => (),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
        Err(e) => return Err(failure(e)),
    }
    result
}

fn backup_rc(directory: &Path, bytes: &[u8]) -> Result<()> {
    fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(directory)
        .map_err(failure)?;
    let folder = OpenOptions::new()
        .read(true)
        .custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32)
        .open(directory)
        .map_err(failure)?;
    let info = folder.metadata().map_err(failure)?;
    if !info.is_dir()
        || info.uid() != rustix::process::getuid().as_raw()
        || info.mode() & 0o077 != 0
    {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe shell backup directory",
        ));
    }
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(directory.join(format!(".envden-backup-{}", uuid::Uuid::new_v4())))
        .map_err(failure)?;
    file.write_all(bytes).map_err(failure)?;
    file.sync_all().map_err(failure)
}
