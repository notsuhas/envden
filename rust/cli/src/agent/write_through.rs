use crate::state::files::{atomic_write, failure};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn write_through(path: &Path, bytes: &[u8], now: u64) -> Result<()> {
    atomic_write(&link_target(path)?, bytes, now)
}

fn link_target(path: &Path) -> Result<PathBuf> {
    let mut current = std::path::absolute(path).map_err(failure)?;
    for _ in 0..40 {
        match fs::canonicalize(&current) {
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
                return Ok(fs::canonicalize(parent)
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
        for bytes in [b"first".as_slice(), b"second"] {
            write_through(&link, bytes, 123).unwrap();
            assert!(fs::symlink_metadata(&link).unwrap().is_symlink());
            assert_eq!(fs::read(&target).unwrap(), bytes);
        }
    }
}
