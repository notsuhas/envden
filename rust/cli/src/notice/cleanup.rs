use envden_core::errors::Result;
use std::path::Path;

pub(super) fn cleanup_old_binary(path: &Path, windows: bool) -> Result<()> {
    if !windows {
        return Ok(());
    }
    let mut old = path.as_os_str().to_os_string();
    old.push(".envden-old");
    match std::fs::remove_file(old) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(crate::state::files::failure(error)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_old_binary_only_on_windows() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("envden.exe");
        let old = root.path().join("envden.exe.envden-old");
        std::fs::write(&old, b"old").unwrap();
        cleanup_old_binary(&path, false).unwrap();
        assert!(old.exists());
        cleanup_old_binary(&path, true).unwrap();
        assert!(!old.exists());
        cleanup_old_binary(&path, true).unwrap();
        std::fs::create_dir(&old).unwrap();
        assert!(cleanup_old_binary(&path, true).is_err());
    }
}
