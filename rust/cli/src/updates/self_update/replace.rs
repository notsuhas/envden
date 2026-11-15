use crate::state::files::{atomic_write, failure};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{fs, path::Path};

pub fn replace_binary(
    path: &Path,
    bytes: &[u8],
    windows: bool,
    verify: impl Fn(&Path) -> Result<()>,
    after: impl Fn() -> Result<()>,
    now: u64,
) -> Result<()> {
    let stat = fs::symlink_metadata(path).map_err(failure)?;
    if !stat.is_file() || stat.is_symlink() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe binary destination",
        ));
    }
    let temporary = path.with_file_name(format!(
        "{}.envden-new{}",
        path.file_name().unwrap().to_string_lossy(),
        if windows { ".exe" } else { "" }
    ));
    atomic_write(&temporary, bytes, now)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o755)).map_err(failure)?;
    }
    if let Err(cause) = verify(&temporary) {
        remove_file(&temporary)?;
        return Err(EnvdenError::with_source(
            ErrorCode::InvalidData,
            "Release binary verification failed",
            cause,
        ));
    }
    let old = path.with_file_name(format!(
        "{}.envden-old",
        path.file_name().unwrap().to_string_lossy()
    ));
    let mut backed_up = false;
    let result = (|| {
        if windows {
            fs::rename(path, &old).map_err(failure)?;
        } else {
            fs::copy(path, &old).map_err(failure)?;
        }
        backed_up = true;
        fs::rename(&temporary, path).map_err(failure)?;
        after()?;
        if !windows {
            fs::remove_file(&old).map_err(failure)?;
        }
        Ok(())
    })();
    if result.is_err() {
        if backed_up {
            if windows {
                remove_file(path)?;
            }
            fs::rename(&old, path).map_err(failure)?;
        }
        remove_file(&temporary)?;
    }
    result
}

fn remove_file(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(failure(error)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn swap_and_rollback() {
        for windows in [false, true] {
            let temp = tempfile::tempdir().unwrap();
            let path = temp.path().join("envden");
            fs::write(&path, b"old").unwrap();
            let fail = || Err(EnvdenError::new(ErrorCode::InvalidData, "failed"));
            assert!(replace_binary(&path, b"new", windows, |_| Ok(()), fail, 1).is_err());
            assert_eq!(fs::read(&path).unwrap(), b"old");
            replace_binary(&path, b"new", windows, |_| Ok(()), || Ok(()), 1).unwrap();
            assert_eq!(fs::read(&path).unwrap(), b"new");
        }
    }
    #[test]
    fn cleanup_failure_takes_precedence_over_verification_failure() {
        let root = tempfile::tempdir().unwrap();
        let binary = root.path().join("envden");
        fs::write(&binary, b"old").unwrap();
        let error = replace_binary(
            &binary,
            b"new",
            false,
            |staged| {
                fs::remove_file(staged).unwrap();
                fs::create_dir(staged).unwrap();
                Err(EnvdenError::new(
                    ErrorCode::InvalidData,
                    "Verification failed",
                ))
            },
            || Ok(()),
            100,
        )
        .unwrap_err();
        assert_eq!(error.code, ErrorCode::Internal);
        assert!(error.source.is_some());
        assert_eq!(fs::read(binary).unwrap(), b"old");
    }
}
