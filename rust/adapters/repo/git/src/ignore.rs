use crate::{adapter::GitRepoAdapter, discovery, exec};
use envden_core::{
    adapters::ICheckout,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::files::validate_path;
use path_clean::PathClean;
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::Path,
};

pub(crate) fn ignored(adapter: &GitRepoAdapter, checkout: &ICheckout, path: &str) -> Result<bool> {
    validate_path(path)?;
    if discovery::tracked(adapter, checkout, path)? {
        return Ok(false);
    }
    match adapter.git(&checkout.root, &["check-ignore", "-q", "--", path], None) {
        Ok(_) => Ok(true),
        Err(e) if exec::exit(&e) == Some(1) => Ok(false),
        Err(e) => Err(e),
    }
}

pub(crate) fn ensure(adapter: &GitRepoAdapter, checkout: &ICheckout, path: &str) -> Result<()> {
    validate_path(path)?;
    if discovery::tracked(adapter, checkout, path)? {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Refusing a tracked env file",
        ));
    }
    if ignored(adapter, checkout, path)? {
        return Ok(());
    }
    if regex::Regex::new(r"[\p{Cc}\p{Cf}]").unwrap().is_match(path) {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe ignore path",
        ));
    }
    let exclude = Path::new(&checkout.root)
        .join(
            adapter
                .git(
                    &checkout.root,
                    &["rev-parse", "--git-path", "info/exclude"],
                    None,
                )?
                .trim_end(),
        )
        .clean();
    let common = Path::new(&checkout.git_dir)
        .canonicalize()
        .map_err(exec::failure)?;
    let parent = exclude.parent().unwrap();
    let rel = parent.strip_prefix(&common).map_err(|_| {
        EnvdenError::new(
            ErrorCode::InvalidInput,
            "Exclude path escapes git directory",
        )
    })?;
    let mut current = common.clone();
    let mut parents = Vec::new();
    for part in
        std::iter::once(std::ffi::OsStr::new("")).chain(rel.components().map(|c| c.as_os_str()))
    {
        current.push(part);
        match fs::DirBuilder::new().mode(0o700).create(&current) {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(e) => return Err(exec::failure(e)),
        }
        let info = current.symlink_metadata().map_err(exec::failure)?;
        if !info.is_dir() || info.is_symlink() {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Unsafe exclude parent",
            ));
        }
        parents.push((current.clone(), info.dev(), info.ino()));
    }
    let escaped: String = path
        .chars()
        .flat_map(|c| {
            if "\\*?[]#! ".contains(c) {
                vec!['\\', c]
            } else {
                vec![c]
            }
        })
        .collect();
    let mut file = OpenOptions::new()
        .read(true)
        .append(true)
        .create(true)
        .mode(0o600)
        .custom_flags((rustix::fs::OFlags::NOFOLLOW | rustix::fs::OFlags::NONBLOCK).bits() as i32)
        .open(&exclude)
        .map_err(exec::failure)?;
    let stat = file.metadata().map_err(exec::failure)?;
    if !stat.is_file() || stat.nlink() != 1 || stat.uid() != rustix::process::getuid().as_raw() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Exclude is not a private regular file",
        ));
    }
    if parent.canonicalize().map_err(exec::failure)? != parent {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe exclude parent",
        ));
    }
    for (path, dev, ino) in parents {
        let info = path.symlink_metadata().map_err(exec::failure)?;
        if path.canonicalize().map_err(exec::failure)? != path
            || !info.is_dir()
            || info.dev() != dev
            || info.ino() != ino
        {
            return Err(EnvdenError::new(
                ErrorCode::Conflict,
                "Exclude parent changed",
            ));
        }
    }
    let mut original = String::new();
    file.read_to_string(&mut original).map_err(exec::failure)?;
    let line = format!("/{escaped}");
    let added = !original.split('\n').any(|s| s == line);
    let suffix = format!("\n{line}\n");
    if added {
        file.write_all(suffix.as_bytes()).map_err(exec::failure)?;
    }
    let result = ignored(adapter, checkout, path).and_then(|ok| {
        if ok {
            Ok(())
        } else {
            Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Could not ignore env file",
            ))
        }
    });
    if result.is_err()
        && added
        && file.metadata().map_err(exec::failure)?.len() == stat.len() + suffix.len() as u64
    {
        file.set_len(stat.len()).map_err(exec::failure)?;
    }
    result
}
