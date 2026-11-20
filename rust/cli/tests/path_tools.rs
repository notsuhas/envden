#![cfg(unix)]

use std::{os::unix::fs::PermissionsExt, process::Command};

#[test]
fn state_writes_never_run_tools_found_on_path() {
    let root = tempfile::tempdir().unwrap();
    let bin = root.path().join("bin");
    let marker = root.path().join("ran");
    std::fs::create_dir(&bin).unwrap();

    let fake = bin.join("hostname");
    std::fs::write(
        &fake,
        format!("#!/bin/sh\ntouch '{}'\necho fake\n", marker.display()),
    )
    .unwrap();
    std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();

    let path = format!(
        "{}:{}",
        bin.display(),
        std::env::var("PATH").unwrap_or_default()
    );
    let output = Command::new(env!("CARGO_BIN_EXE_envden"))
        .args(["config", "update-check", "off"])
        .current_dir(root.path())
        .env("PATH", path)
        .env("HOME", root.path())
        .env("ENVDEN_HOME", root.path().join("envden"))
        .env("DO_NOT_TRACK", "1")
        .output()
        .unwrap();

    assert!(output.status.success(), "{output:?}");
    assert!(!marker.exists(), "envden ran hostname from PATH");
}
