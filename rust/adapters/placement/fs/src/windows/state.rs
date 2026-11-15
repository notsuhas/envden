use envden_core::filesystem::ICanonicalPath;
use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    filesystem::{IFileIdentity, path_identity},
};
use std::{
    fs::{self, File, Metadata, OpenOptions},
    os::windows::fs::OpenOptionsExt,
    path::{Path, PathBuf},
};

pub(crate) fn failure(e: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::Conflict, "Placement operation failed", e)
}
pub(crate) fn invalid(message: &'static str) -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidInput, message)
}
pub(crate) fn stat(path: &Path) -> Result<Option<Metadata>> {
    match path.symlink_metadata() {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(failure(e)),
    }
}
pub(crate) fn identity(path: &Path) -> Result<Option<IFileIdentity>> {
    match path_identity(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(failure(e)),
    }
}
pub(crate) fn same(a: &Option<IFileIdentity>, b: &Option<IFileIdentity>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => {
            a.device == b.device
                && a.inode == b.inode
                && a.size == b.size
                && milliseconds(a.modified_ns) == milliseconds(b.modified_ns)
                && milliseconds(a.changed_ns) == milliseconds(b.changed_ns)
        }
        _ => false,
    }
}
pub(crate) fn read(path: &Path) -> Result<File> {
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(0x00200000)
        .open(path)
        .map_err(failure)?;
    if file.metadata().map_err(failure)?.is_symlink() {
        return Err(failure(std::io::Error::other(
            "Cannot follow symbolic link",
        )));
    }
    Ok(file)
}
pub(crate) fn parents(
    root: &Path,
    relative: &Path,
    create: bool,
) -> Result<Option<Vec<(PathBuf, IFileIdentity)>>> {
    let mut current = root.to_owned();
    let mut result = Vec::new();
    for part in std::iter::once(std::ffi::OsStr::new("")).chain(
        relative
            .parent()
            .unwrap()
            .components()
            .map(|c| c.as_os_str()),
    ) {
        current.push(part);
        let mut info = stat(&current)?;
        if info.is_none() && create && current != root {
            match fs::create_dir(&current) {
                Ok(()) => (),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
                Err(e) => return Err(failure(e)),
            }
            info = stat(&current)?;
        }
        let Some(info) = info else { return Ok(None) };
        if !info.is_dir() || info.is_symlink() {
            return Err(if create {
                invalid(if current == root {
                    "Unsafe checkout root"
                } else {
                    "Unsafe checkout parent"
                })
            } else {
                EnvdenError::new(ErrorCode::Conflict, "Unsafe checkout parent")
            });
        }
        result.push((current.clone(), path_identity(&current).map_err(failure)?));
    }
    Ok(Some(result))
}
pub(crate) fn verify(parents: &[(PathBuf, IFileIdentity)], destination: &Path) -> Result<()> {
    for (path, before) in parents {
        let info = path.symlink_metadata().map_err(failure)?;
        let current = path_identity(path).map_err(failure)?;
        if !info.is_dir()
            || info.is_symlink()
            || current.device != before.device
            || current.inode != before.inode
        {
            return Err(EnvdenError::new(
                ErrorCode::Conflict,
                "Checkout parent changed",
            ));
        }
    }
    let root = parents[0].0.canonical_path().map_err(failure)?;
    let target = destination
        .parent()
        .unwrap()
        .canonical_path()
        .map_err(failure)?;
    if envden_core::paths::place_in_root_windows(&root.to_string_lossy(), &target.to_string_lossy())
        == envden_core::paths::TRootPlacement::Outside
    {
        return Err(EnvdenError::new(
            ErrorCode::Conflict,
            "Checkout parent escaped root",
        ));
    }
    Ok(())
}

fn milliseconds(ns: i128) -> f64 {
    ns.div_euclid(1_000_000_000) as f64 * 1000.0 + ns.rem_euclid(1_000_000_000) as f64 / 1_000_000.0
}
