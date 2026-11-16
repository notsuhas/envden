use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    process::restrict_access,
};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};

pub(crate) fn failure(e: std::io::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::Locked, "Key storage operation failed", e)
}

pub(crate) fn read(path: &Path) -> Result<Option<Vec<u8>>> {
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(failure(e)),
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if file.metadata().map_err(failure)?.mode() & 0o077 != 0 {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Key file is accessible to other users",
            ));
        }
    }
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).map_err(failure)?;
    Ok(Some(bytes))
}

fn sync(directory: &Path) -> std::io::Result<()> {
    if cfg!(windows) {
        return Ok(());
    }
    File::open(directory)?.sync_all()
}

pub(crate) fn write(path: &Path, value: &[u8]) -> Result<()> {
    let directory = path.parent().unwrap();
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(directory).map_err(failure)?;
    restrict_access(directory, true).map_err(permission_failure)?;
    let temporary = directory.join(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(failure)?;
        restrict_access(&temporary, false).map_err(permission_failure)?;
        file.write_all(value).map_err(failure)?;
        file.sync_all().map_err(failure)?;
        drop(file);
        fs::rename(&temporary, path).map_err(failure)?;
        sync(directory).map_err(failure)
    })();
    let cleanup = fs::remove_file(&temporary);
    if let Err(e) = cleanup
        && e.kind() != std::io::ErrorKind::NotFound
    {
        return Err(failure(e));
    }
    result
}

pub(crate) fn delete(path: &Path) -> Result<()> {
    if let Err(e) = fs::remove_file(path)
        && e.kind() != std::io::ErrorKind::NotFound
    {
        return Err(failure(e));
    }
    if let Err(e) = sync(path.parent().unwrap())
        && e.kind() != std::io::ErrorKind::NotFound
    {
        return Err(failure(e));
    }
    Ok(())
}

fn permission_failure(error: EnvdenError) -> EnvdenError {
    if cfg!(windows) {
        error
    } else {
        EnvdenError {
            code: ErrorCode::Locked,
            message: "Key storage operation failed".into(),
            source: error.source,
        }
    }
}

pub(crate) fn owner_only(directory: &Path) -> Result<bool> {
    if cfg!(windows) {
        return Ok(true);
    }
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(true),
        Err(error) => return Err(failure(error)),
    };
    let mut paths = vec![directory.to_owned()];
    for entry in entries {
        paths.push(entry.map_err(failure)?.path());
    }
    let metadata = paths
        .iter()
        .map(fs::metadata)
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(failure)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        Ok(metadata
            .iter()
            .all(|info| info.permissions().mode() & 0o077 == 0))
    }
    #[cfg(windows)]
    {
        let _ = metadata;
        Ok(true)
    }
}
