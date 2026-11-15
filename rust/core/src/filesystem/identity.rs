use std::{fs::File, io, path::Path};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IFileIdentity {
    pub device: u64,
    pub inode: u64,
    pub size: u64,
    pub links: u64,
    pub modified_ns: i128,
    pub changed_ns: i128,
    pub birth_ms: String,
}

#[cfg(unix)]
fn identity(info: std::fs::Metadata) -> IFileIdentity {
    use std::os::unix::fs::MetadataExt;
    let birth_ms = info
        .created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| (d.as_secs() as f64 * 1000.0 + d.subsec_nanos() as f64 / 1_000_000.0).to_string())
        .unwrap_or_else(|| "0".into());
    IFileIdentity {
        device: info.dev(),
        inode: info.ino(),
        size: info.len(),
        links: info.nlink(),
        modified_ns: info.mtime() as i128 * 1_000_000_000 + info.mtime_nsec() as i128,
        changed_ns: info.ctime() as i128 * 1_000_000_000 + info.ctime_nsec() as i128,
        birth_ms,
    }
}

pub fn file_identity(file: &File) -> io::Result<IFileIdentity> {
    #[cfg(unix)]
    {
        Ok(identity(file.metadata()?))
    }
    #[cfg(windows)]
    {
        super::windows::identity(file)
    }
}

pub fn path_identity(path: impl AsRef<Path>) -> io::Result<IFileIdentity> {
    #[cfg(unix)]
    {
        Ok(identity(std::fs::symlink_metadata(path)?))
    }
    #[cfg(windows)]
    {
        super::windows::path_identity(path.as_ref())
    }
}

pub trait ICanonicalPath {
    fn canonical_path(&self) -> std::io::Result<std::path::PathBuf>;
}

impl ICanonicalPath for std::path::Path {
    fn canonical_path(&self) -> std::io::Result<std::path::PathBuf> {
        dunce::canonicalize(self)
    }
}
