use super::*;

#[test]
fn optional_text_reads_replace_invalid_utf8() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("state");
    fs::write(&path, b"a\xffb").unwrap();
    assert_eq!(optional_read(&path).unwrap().as_deref(), Some("a\u{fffd}b"));
}

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[cfg(unix)]
#[test]
fn atomic_write_preserves_external_parent_permissions() {
    let dir = tempfile::tempdir().unwrap();
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o755)).unwrap();
    atomic_write(&dir.path().join("restored"), b"content", 1).unwrap();
    assert_eq!(
        fs::metadata(dir.path()).unwrap().permissions().mode() & 0o777,
        0o755
    );
    private_directory(dir.path()).unwrap();
    let nested = dir.path().join("nested");
    fs::create_dir(&nested).unwrap();
    fs::set_permissions(&nested, fs::Permissions::from_mode(0o755)).unwrap();
    atomic_write(&nested.join("state"), b"content", 1).unwrap();
    assert_eq!(
        fs::metadata(nested).unwrap().permissions().mode() & 0o777,
        0o700
    );
}

#[test]
fn private_directory_applies_platform_access_restrictions() {
    let temp = tempfile::tempdir().unwrap();
    let directory = temp.path().join("state");
    let applied = std::cell::Cell::new(false);
    private_directory_with(&directory, &|path, is_directory| {
        assert!(path.is_dir());
        assert!(is_directory);
        applied.set(true);
        Ok(())
    })
    .unwrap();
    assert!(applied.get());
}

#[test]
fn temporary_file_is_restricted_before_writing_or_renaming() {
    let temp = tempfile::tempdir().unwrap();
    let destination = temp.path().join("state");
    let result = atomic_write_with(&destination, b"A=1", 42, &|path, directory| {
        assert!(!directory);
        assert_eq!(fs::metadata(path).unwrap().len(), 0);
        Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Cannot restrict access",
        ))
    });
    assert_eq!(result.unwrap_err().message, "Cannot restrict access");
    assert!(!destination.exists());
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 0);
}

#[test]
fn atomic_write_reports_cleanup_failure_before_original_failure() {
    let temp = tempfile::tempdir().unwrap();
    let destination = temp.path().join("state");
    let result = atomic_write_with(&destination, b"A=1", 42, &|path, _| {
        fs::remove_file(path).unwrap();
        fs::create_dir(path).unwrap();
        Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Cannot restrict access",
        ))
    });
    assert_eq!(result.unwrap_err().message, "State file operation failed");
}
