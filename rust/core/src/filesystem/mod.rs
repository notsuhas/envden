mod identity;
#[cfg(windows)]
mod windows;
pub use identity::{ICanonicalPath, IFileIdentity, file_identity, path_identity};
