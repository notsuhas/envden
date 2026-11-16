use crate::state::files::{atomic_write, failure};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_core::filesystem::ICanonicalPath;
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn write_through(path: &Path, bytes: &[u8], now: u64) -> Result<()> {
    let target = link_target(path)?;
    let parent = target.parent().expect("absolute target");
    let permissions = fs::metadata(parent).map_err(failure)?.permissions();
    let result = atomic_write(&target, bytes, now);
    fs::set_permissions(parent, permissions).map_err(failure)?;

    result
}

fn link_target(path: &Path) -> Result<PathBuf> {
    let mut current = std::path::absolute(path).map_err(failure)?;
    for _ in 0..40 {
        match current.canonical_path() {
            Ok(real) => return Ok(real),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(failure(e)),
        }
        match fs::symlink_metadata(&current) {
            Ok(info) if info.is_symlink() => {
                let target = fs::read_link(&current).map_err(failure)?;
                current = current.parent().unwrap().join(target);
            }
            Ok(_) => return Ok(current),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let parent = current.parent().unwrap();
                fs::create_dir_all(parent).map_err(failure)?;
                return Ok(parent
                    .canonical_path()
                    .map_err(failure)?
                    .join(current.file_name().unwrap()));
            }
            Err(e) => return Err(failure(e)),
        }
    }
    Err(EnvdenError::new(
        ErrorCode::InvalidInput,
        "Too many symbolic links",
    ))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn preserves_existing_and_dangling_links() {
        let temp = tempfile::tempdir().unwrap();
        let link = temp.path().join("skill");
        let target = temp.path().join("dotfiles/SKILL.md");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(target.parent().unwrap(), fs::Permissions::from_mode(0o755)).unwrap();
        for bytes in [b"first".as_slice(), b"second"] {
            write_through(&link, bytes, 123).unwrap();
            assert!(fs::symlink_metadata(&link).unwrap().is_symlink());
            assert_eq!(fs::read(&target).unwrap(), bytes);
            assert_eq!(
                fs::metadata(target.parent().unwrap())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o755
            );
        }
    }
}
