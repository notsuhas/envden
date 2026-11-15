use envden_core::errors::{EnvdenError, ErrorCode, Result};
use rustix::fs::*;
use std::{
    fs::File,
    io::{Read, Write},
    os::fd::{AsFd, OwnedFd},
    path::Path,
};

pub(crate) fn failure(e: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> EnvdenError {
    EnvdenError::with_source(
        ErrorCode::Conflict,
        "Descriptor-relative operation failed",
        e,
    )
}

pub(crate) fn parent(root: &Path, relative: &Path, create: bool) -> Result<OwnedFd> {
    let flags = OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC;
    let mut fd = open(root, flags, Mode::empty()).map_err(failure)?;
    for part in relative.parent().unwrap().components() {
        if create {
            let _ = mkdirat(&fd, part.as_os_str(), Mode::from_raw_mode(0o700));
        }
        fd = openat(&fd, part.as_os_str(), flags, Mode::empty()).map_err(|e| {
            if !create && e == rustix::io::Errno::NOENT {
                EnvdenError::new(ErrorCode::NotFound, "Checkout parent is missing")
            } else {
                EnvdenError::with_source(ErrorCode::Conflict, "Unsafe checkout parent", e)
            }
        })?;
    }
    Ok(fd)
}

pub(crate) fn identity(fd: impl AsFd, name: &str) -> Result<Option<Stat>> {
    match statat(fd, name, AtFlags::SYMLINK_NOFOLLOW) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e == rustix::io::Errno::NOENT => Ok(None),
        Err(e) => Err(failure(e)),
    }
}

pub(crate) fn same(a: &Option<Stat>, b: &Option<Stat>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => {
            a.st_dev == b.st_dev
                && a.st_ino == b.st_ino
                && a.st_size == b.st_size
                && a.st_mtime == b.st_mtime
                && a.st_mtime_nsec == b.st_mtime_nsec
                && a.st_ctime == b.st_ctime
                && a.st_ctime_nsec == b.st_ctime_nsec
        }
        _ => false,
    }
}

pub(crate) fn assert_identity(fd: impl AsFd, name: &str, before: &Option<Stat>) -> Result<()> {
    if !same(before, &identity(fd, name)?) {
        return Err(EnvdenError::new(
            ErrorCode::Conflict,
            "Placement entry changed",
        ));
    }
    Ok(())
}

pub(crate) fn read(fd: impl AsFd, name: impl AsRef<Path>, store: bool) -> Result<Vec<u8>> {
    let source = openat(
        fd,
        name.as_ref(),
        OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK,
        Mode::empty(),
    )
    .map_err(failure)?;
    let stat = fstat(&source).map_err(failure)?;
    if FileType::from_raw_mode(stat.st_mode) != FileType::RegularFile {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            if store {
                "Store source is not a regular file"
            } else {
                "Destination is not a file"
            },
        ));
    }
    if store {
        fchmod(&source, Mode::from_raw_mode(0o600)).map_err(failure)?;
    }
    let mut bytes = Vec::new();
    File::from(source)
        .read_to_end(&mut bytes)
        .map_err(failure)?;
    Ok(bytes)
}

pub(crate) fn write(fd: impl AsFd, name: &str, bytes: &[u8]) -> Result<()> {
    let dest = openat(
        fd,
        name,
        OFlags::CREATE | OFlags::EXCL | OFlags::NOFOLLOW | OFlags::WRONLY,
        Mode::from_raw_mode(0o600),
    )
    .map_err(failure)?;
    let mut file = File::from(dest);
    file.write_all(bytes).map_err(failure)?;
    file.sync_all().map_err(failure)
}
