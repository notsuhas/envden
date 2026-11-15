use crate::errors::Result;
#[cfg(unix)]
use crate::errors::{EnvdenError, ErrorCode};
use std::path::Path;
pub fn acl_arguments(path: &str, directory: bool, username: &str) -> Vec<String> {
    vec![
        path.into(),
        "/inheritance:r".into(),
        "/grant:r".into(),
        format!("{}:{}F", username, if directory { "(OI)(CI)" } else { "" }),
    ]
}
pub fn restrict_access(path: impl AsRef<Path>, directory: bool) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(
            path,
            std::fs::Permissions::from_mode(if directory { 0o700 } else { 0o600 }),
        )
        .map_err(|e| EnvdenError::with_source(ErrorCode::InvalidInput, "Cannot restrict access", e))
    }
    #[cfg(windows)]
    {
        super::exec_trusted_sync(
            "icacls",
            &acl_arguments(
                &path.as_ref().to_string_lossy(),
                directory,
                &super::windows_user::username()?,
            ),
            &Default::default(),
        )
        .map(|_| ())
    }
}
pub use restrict_access as restrict_access_sync;
