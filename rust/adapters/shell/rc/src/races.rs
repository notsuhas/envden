use crate::edit::edit_with_hooks;
use envden_core::errors::ErrorCode;
use std::{cell::RefCell, fs, os::unix::fs::symlink};

#[test]
fn swaps_never_copy_private_bytes_to_checkout() {
    for stage in ["resolved", "opened", "read"] {
        let home = tempfile::tempdir().unwrap();
        let path = home.path().join("rc");
        let target = home.path().join("checkout");
        let private = home.path().join("private");
        fs::write(&target, "# user\n").unwrap();
        fs::write(&private, "PRIVATE BYTES").unwrap();
        symlink(&target, &path).unwrap();
        let result = RefCell::new(String::new());
        assert!(
            edit_with_hooks(
                &path,
                None,
                |current| {
                    result.replace(current.into());
                    format!("{current}# edited\n")
                },
                |step| {
                    if step == stage {
                        fs::rename(&target, home.path().join("original")).unwrap();
                        symlink(&private, &target).unwrap();
                    }
                }
            )
            .is_err()
        );
        assert!(!result.borrow().contains("PRIVATE BYTES"));
        assert_eq!(fs::read(&private).unwrap(), b"PRIVATE BYTES");
        fs::remove_file(&target).unwrap();
        fs::write(&target, "checkout replacement").unwrap();
        assert!(
            !fs::read_to_string(target)
                .unwrap()
                .contains("PRIVATE BYTES")
        );
    }
}

#[test]
fn resolved_private_file_does_not_follow_swapped_checkout() {
    for install in [true, false] {
        let home = tempfile::tempdir().unwrap();
        let path = home.path().join("rc");
        let checkout = home.path().join("checkout");
        let private = home.path().join("private");
        fs::write(&private, "PRIVATE BYTES\n# hook\n").unwrap();
        symlink(&private, &checkout).unwrap();
        symlink(&checkout, &path).unwrap();
        edit_with_hooks(
            &path,
            None,
            |current| {
                if install {
                    format!("{current}# installed\n")
                } else {
                    current.replace("# hook\n", "")
                }
            },
            |step| {
                if step == "read" {
                    fs::remove_file(&checkout).unwrap();
                    fs::write(&checkout, "checkout replacement").unwrap();
                }
            },
        )
        .unwrap();
        assert_eq!(fs::read(checkout).unwrap(), b"checkout replacement");
    }
}

#[test]
fn concurrent_append_is_retained_as_conflict() {
    let home = tempfile::tempdir().unwrap();
    let path = home.path().join("rc");
    fs::write(&path, "original").unwrap();
    let error = edit_with_hooks(
        &path,
        None,
        |_| "replacement".into(),
        |step| {
            if step == "read" {
                fs::write(&path, "original appended").unwrap();
            }
        },
    )
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::Conflict);
    assert_eq!(fs::read(path).unwrap(), b"original appended");
}

#[test]
fn readonly_replacement_preserves_mode_and_leaves_no_temporary() {
    use std::os::unix::fs::PermissionsExt;
    let home = tempfile::tempdir().unwrap();
    let path = home.path().join("rc");
    fs::write(&path, "# user\n").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o444)).unwrap();
    edit_with_hooks(&path, None, |s| format!("{s}# edited\n"), |_| {}).unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"# user\n# edited\n");
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o444
    );
    assert_eq!(fs::read_dir(home.path()).unwrap().count(), 1);
    assert!(edit_with_hooks(home.path(), None, |_| "replacement".into(), |_| {}).is_err());
}

#[test]
fn unexpected_errors_hide_private_shell_contents() {
    let error = crate::edit::failure(std::io::Error::other("private shell contents"));
    assert_eq!(error.code, ErrorCode::Internal);
    assert_eq!(error.source.unwrap().to_string(), "private shell contents");
    assert!(!error.message.contains("private shell contents"));
}
