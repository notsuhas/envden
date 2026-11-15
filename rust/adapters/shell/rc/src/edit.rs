use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_core::filesystem::ICanonicalPath;
use envden_core::filesystem::{IFileIdentity, file_identity, path_identity};
use path_clean::PathClean;
#[cfg(unix)]
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::{
    fs::{self, File, Metadata, OpenOptions},
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

fn validate(file: &File, info: &Metadata) -> Result<()> {
    let identity = file_identity(file).map_err(failure)?;
    #[cfg(unix)]
    let owned = info.uid() == rustix::process::getuid().as_raw();
    #[cfg(windows)]
    let owned = true;
    if !info.is_file() || identity.links != 1 || !owned {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe shell configuration file",
        ));
    }
    Ok(())
}

pub(crate) fn same(a: &IFileIdentity, b: &IFileIdentity) -> bool {
    a.device == b.device
        && a.inode == b.inode
        && a.size == b.size
        && milliseconds(a.modified_ns) == milliseconds(b.modified_ns)
        && milliseconds(a.changed_ns) == milliseconds(b.changed_ns)
}

pub(crate) fn edit(
    path: &Path,
    backup: Option<&Path>,
    transform: impl Fn(&str) -> String,
) -> Result<()> {
    edit_with_hooks(path, backup, transform, |_| {})
}

pub(crate) fn edit_with_hooks(
    path: &Path,
    backup: Option<&Path>,
    transform: impl Fn(&str) -> String,
    hook: impl Fn(&str),
) -> Result<()> {
    let mut resolved = path.to_owned();
    let mut exists = false;
    for _ in 0..40 {
        match resolved.canonical_path() {
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
    hook("resolved");
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000 | 0x02000000);
    }
    if !exists {
        options.create_new(true).write(true);
        #[cfg(unix)]
        options.mode(0o600);
    }
    let mut file = options.open(&resolved).map_err(failure)?;
    hook("opened");
    let opened = file.metadata().map_err(failure)?;
    let stat = fs::symlink_metadata(&resolved).map_err(failure)?;
    validate(&file, &opened)?;
    if !stat.is_file() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe shell configuration file",
        ));
    }
    let expected = crate::identity::baseline(&resolved, &file_identity(&file).map_err(failure)?)?;
    #[cfg(windows)]
    crate::windows::verify_owner(&resolved)?;
    let mut original = Vec::new();
    file.read_to_end(&mut original).map_err(failure)?;
    hook("read");
    let current: String = original.iter().copied().map(char::from).collect();
    let next = transform(&current);
    if current == next {
        return Ok(());
    }
    if let Some(directory) = backup {
        crate::edit_files::backup_rc(directory, &original)?;
    }
    let temporary = resolved
        .parent()
        .unwrap()
        .join(format!(".envden-rc-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        options.mode(stat.mode() & 0o777);
        let mut replacement = options.open(&temporary).map_err(failure)?;
        #[cfg(unix)]
        replacement
            .set_permissions(fs::Permissions::from_mode(stat.mode() & 0o777))
            .map_err(failure)?;
        let bytes: Vec<u8> = next.chars().map(|c| c as u8).collect();
        replacement.write_all(&bytes).map_err(failure)?;
        replacement.sync_all().map_err(failure)?;
        drop(replacement);
        if !same(&path_identity(&resolved).map_err(failure)?, &expected) {
            return Err(EnvdenError::new(
                ErrorCode::Conflict,
                "Shell configuration changed during editing",
            ));
        }
        #[cfg(windows)]
        fs::set_permissions(&temporary, stat.permissions()).map_err(failure)?;
        crate::edit_files::replace(&temporary, &resolved, &expected)
    })();
    match fs::remove_file(&temporary) {
        Ok(()) => (),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
        Err(e) => return Err(failure(e)),
    }
    result
}

fn milliseconds(ns: i128) -> f64 {
    ns.div_euclid(1_000_000_000) as f64 * 1000.0 + ns.rem_euclid(1_000_000_000) as f64 / 1_000_000.0
}
