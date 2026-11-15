use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::{base32, h, validate_path};
use std::path::{Path, PathBuf};

pub fn store_path(home: &Path, repo_id: &str, path: &str) -> Result<PathBuf> {
    validate_path(path)?;
    let root = home
        .join("store")
        .join(base32(&h("local-repo", repo_id.as_bytes())));
    let result = root.join(path);
    if !result.starts_with(&root) || result == root {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsafe store path",
        ));
    }
    Ok(result)
}
