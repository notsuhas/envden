use super::{spawn::spawn_with_directories, trust::inside_working_tree_with, *};
use std::{
    collections::BTreeMap,
    fs,
    os::unix::fs::{PermissionsExt, symlink},
    path::Path,
};

fn script(path: &Path, content: &str) {
    fs::write(path, content).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
}

#[test]
fn env_shebang_searches_system_before_user_symlink_payload() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    for dir in ["system", "user", "checkout"] {
        fs::create_dir(root.join(dir)).unwrap();
    }
    script(&root.join("system/git"), "#!/bin/sh\nprintf system");
    script(&root.join("checkout/git"), "#!/bin/sh\nprintf compromised");
    symlink(root.join("checkout/git"), root.join("user/git")).unwrap();
    script(&root.join("script"), "#!/usr/bin/env git\n");
    let dirs = [
        root.join("system").to_string_lossy().into_owned(),
        root.join("user").to_string_lossy().into_owned(),
    ];
    let output = spawn_with_directories(
        root.join("script").to_str().unwrap(),
        &[],
        &Default::default(),
        Some(&dirs),
    )
    .unwrap()
    .wait_with_output()
    .unwrap();
    assert_eq!(output.stdout, b"system");
    assert!(output.status.success());
}

#[test]
fn renamed_and_separate_git_dir_on_path_cannot_supply_tools() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join(".git")).unwrap();
    fs::rename(root.path().join(".git"), root.path().join("metadata")).unwrap();
    for name in [
        "git",
        "ssh",
        "brew",
        "tailscale",
        "ps",
        "launchctl",
        "envden-fake-tool",
    ] {
        script(&root.path().join(name), "#!/bin/sh\necho compromised");
    }
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "process::parity::path_child", "--nocapture"])
        .env("PATH", root.path())
        .env("HOME", root.path())
        .env("ENVDEN_PARITY_ROOT", root.path())
        .output()
        .unwrap();
    assert!(output.status.success(), "{:?}", output.stderr);
}

#[test]
fn path_child() {
    let Ok(root) = std::env::var("ENVDEN_PARITY_ROOT") else {
        return;
    };
    for name in [
        "git",
        "ssh",
        "brew",
        "tailscale",
        "ps",
        "launchctl",
        "envden-fake-tool",
    ] {
        match resolve_trusted_executable(name) {
            Ok(path) => assert!(!path.starts_with(&root)),
            Err(error) => assert_eq!(error.message, "Trusted executable unavailable"),
        }
    }
    assert!(
        !sanitized_environment(&BTreeMap::new(), &std::env::vars().collect(), None)["PATH"]
            .split(':')
            .any(|p| p == root)
    );
}

#[test]
fn runtime_executes_with_sanitized_environment() {
    let options = ISpawnOptions {
        env: BTreeMap::from([("ENVDEN_PARITY_RUNTIME".into(), Some("1".into()))]),
        ..Default::default()
    };
    let output = spawn_trusted(
        "bun",
        &["--exact", "process::parity::runtime_child", "--nocapture"].map(str::to_owned),
        &options,
    )
    .unwrap()
    .wait_with_output()
    .unwrap();
    assert!(output.status.success());
    assert_eq!(
        output.stdout.strip_prefix(b"\nrunning 1 test\n").unwrap(),
        b"runtime"
    );
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "process::parity::sync_child", "--nocapture"])
        .env("NODE_PATH", "payload")
        .env("ENVDEN_PARITY_SYNC", "1")
        .output()
        .unwrap();
    assert!(output.status.success(), "{:?}", output.stderr);
}

#[test]
fn runtime_child() {
    if std::env::var_os("ENVDEN_PARITY_RUNTIME").is_none() {
        return;
    }
    assert!(std::env::var_os("NODE_PATH").is_none());
    use std::io::Write;
    std::io::stdout().write_all(b"runtime").unwrap();
    std::process::exit(0);
}

#[test]
fn sync_child() {
    if std::env::var_os("ENVDEN_PARITY_SYNC").is_none() {
        return;
    }
    let output = exec_trusted_sync(
        "bun",
        &["--exact", "process::parity::runtime_child", "--nocapture"].map(str::to_owned),
        &ISpawnOptions {
            env: BTreeMap::from([("ENVDEN_PARITY_RUNTIME".into(), Some("1".into()))]),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        output.strip_prefix("\nrunning 1 test\n").unwrap(),
        "runtime"
    );
}

#[test]
fn fake_homebrew_on_linux_remains_a_checkout() {
    let exists = |p: &Path| p == Path::new("/opt/homebrew/.git");
    assert!(inside_working_tree_with(
        Path::new("/opt/homebrew/bin"),
        Some(&manager_roots("linux", "x64")),
        exists
    ));
    assert!(!inside_working_tree_with(
        Path::new("/opt/homebrew/bin"),
        Some(&manager_roots("darwin", "arm64")),
        exists
    ));
}
