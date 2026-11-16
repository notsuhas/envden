use super::*;

#[test]
fn every_read_command_disables_repository_fsmonitor() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    git(root, &["init", "-q"]);
    git(
        root,
        &["remote", "add", "origin", "https://github.com/team/repo"],
    );
    let marker = root.join("executed");
    let script = root.join("monitor");
    fs::write(
        &script,
        format!("#!/bin/sh\ntouch '{}'\n", marker.display()),
    )
    .unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&script, fs::Permissions::from_mode(0o700)).unwrap();
    }
    git(
        root,
        &["config", "core.fsmonitor", script.to_str().unwrap()],
    );
    fs::write(root.join(".env"), "secret").unwrap();
    fs::write(root.join(".gitignore"), ".env\n").unwrap();
    for args in [
        vec!["ls-files", "-z", "--", ".env"],
        vec!["check-ignore", "--", ".env"],
        vec!["rev-parse", "--show-toplevel"],
        vec!["worktree", "list", "--porcelain", "-z"],
        vec!["remote", "get-url", "origin"],
        vec!["config", "--get", "core.fsmonitor"],
    ] {
        exec::git(root.to_str().unwrap(), &args, None, false, root.to_str()).unwrap();
    }
    assert!(!marker.exists());
}

#[test]
fn checkout_preserves_trusted_executable_failure() {
    let root = tempfile::tempdir().unwrap();
    let source = Box::new(std::io::Error::other("original"));
    let pointer = std::ptr::from_ref(source.as_ref());
    let error = crate::checkout::root_with(root.path().to_str().unwrap(), |_, _| {
        Err(EnvdenError {
            code: ErrorCode::InvalidInput,
            message: "Trusted executable unavailable".into(),
            source: Some(source),
        })
    })
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::InvalidInput);
    assert_eq!(error.message, "Trusted executable unavailable");
    assert!(std::ptr::eq(
        error
            .source
            .unwrap()
            .downcast_ref::<std::io::Error>()
            .unwrap(),
        pointer
    ));
}
