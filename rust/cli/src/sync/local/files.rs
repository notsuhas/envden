use crate::state::files::{atomic_write, failure};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::base32;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn read_bytes(path: &Path) -> Result<Option<Vec<u8>>> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(failure(e)),
        Ok(meta) if !meta.is_file() || meta.is_symlink() => {
            return Err(EnvdenError::new(ErrorCode::InvalidData, "Unsafe sync file"));
        }
        Ok(_) => {}
    }
    fs::read(path).map(Some).map_err(failure)
}

pub fn base_path(home: &Path, store: &str, root: Option<&str>) -> PathBuf {
    let text = root
        .filter(|r| !r.is_empty())
        .map_or_else(|| store.to_owned(), |root| format!("{store}\0{root}"));
    home.join("base")
        .join(base32(&Sha256::digest(text.as_bytes())))
}

pub fn write_bytes(path: &Path, bytes: Option<&[u8]>, now: u64) -> Result<()> {
    if read_bytes(path)?.as_deref() == bytes {
        return Ok(());
    }
    if let Some(bytes) = bytes {
        return atomic_write(path, bytes, now);
    }
    fs::remove_file(path).map_err(failure)?;
    #[cfg(not(windows))]
    if let Some(parent) = path.parent() {
        fs::File::open(parent)
            .and_then(|f| f.sync_all())
            .map_err(failure)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn byte_roundtrip_and_absence() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("base/file");
        assert_eq!(read_bytes(&path).unwrap(), None);
        write_bytes(&path, Some(b"A=1\n\0"), 1).unwrap();
        assert_eq!(read_bytes(&path).unwrap().unwrap(), b"A=1\n\0");
        write_bytes(&path, None, 1).unwrap();
        write_bytes(&path, None, 1).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn refuses_links_even_dangling() {
        let dir = tempfile::tempdir().unwrap();
        let link = dir.path().join("link");
        std::os::unix::fs::symlink(dir.path().join("missing"), &link).unwrap();
        assert_eq!(read_bytes(&link).unwrap_err().message, "Unsafe sync file");
    }
}
