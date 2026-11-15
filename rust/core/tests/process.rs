use envden_core::process::*;
use std::{collections::BTreeMap, fs};
#[test]
fn directory_policy() {
    assert_eq!(
        &fixed_directories("darwin")[..4],
        ["/usr/bin", "/bin", "/usr/sbin", "/sbin"]
    );
    assert!(!fixed_directories("linux").contains(&"/opt/homebrew/bin".into()));
    assert_eq!(manager_roots("darwin", "arm64"), ["/opt/homebrew"]);
    assert_eq!(manager_roots("darwin", "x64"), ["/usr/local/Homebrew"]);
    assert!(!manager_roots("linux", "x64").contains(&"/opt/homebrew".into()));
    assert_eq!(
        fixed_directories("win32"),
        [
            r"C:\Windows\System32",
            r"C:\Windows\System32\OpenSSH",
            r"C:\Windows\System32\WindowsPowerShell\v1.0",
            r"C:\Program Files\PowerShell\7",
            r"C:\Program Files\Git\cmd",
            r"C:\Program Files\Tailscale"
        ]
    );
}
#[test]
fn owner_mode_policy() {
    for (mode, gid, platform, expected) in [
        (0o40775, 80, "linux", false),
        (0o40775, 80, "darwin", true),
        (0o40775, 0, "linux", true),
        (0o40775, 20, "linux", false),
        (0o40777, 80, "linux", false),
    ] {
        assert_eq!(
            trusted_owner_and_mode(mode, 1000, gid, platform, 1000),
            expected
        );
    }
    assert!(!trusted_owner_and_mode(0o755, 999, 0, "linux", 1000));
    assert!(trusted_owner_and_mode(0o777, 999, 999, "win32", 1000));
}
#[test]
fn environment_allowlist() {
    let inherited: BTreeMap<String, String> = [
        ("HOME", "/home/test"),
        ("XDG_CONFIG_HOME", "/home/test/.config"),
        ("LANG", "C"),
        ("LC_ALL", "C"),
        ("PATH", "."),
        ("HOMEBREW_BASH_COMMAND", "payload"),
        ("NODE_PATH", "payload"),
        ("GIT_EXEC_PATH", "payload"),
        ("NODE_OPTIONS", "payload"),
        ("GIT_CONFIG_NOSYSTEM", "payload"),
    ]
    .into_iter()
    .map(|(k, v)| (k.into(), v.into()))
    .collect();
    let extra = BTreeMap::from([
        ("GIT_CONFIG_NOSYSTEM".into(), Some("1".into())),
        ("Path".into(), Some("/attacker".into())),
    ]);
    let env = sanitized_environment(&extra, &inherited, None);
    assert_eq!(env["HOME"], "/home/test");
    assert_eq!(env["LC_ALL"], "C");
    assert_eq!(env["GIT_CONFIG_NOSYSTEM"], "1");
    for key in [
        "HOMEBREW_BASH_COMMAND",
        "NODE_PATH",
        "NODE_OPTIONS",
        "GIT_EXEC_PATH",
        "Path",
    ] {
        assert!(!env.contains_key(key));
    }
    assert_eq!(
        env["PATH"],
        trusted_directories(None, None).join(if cfg!(windows) { ";" } else { ":" })
    );
}
#[path = "process/trust.rs"]
mod trust;

#[test]
fn runtime_is_explicitly_trusted() {
    let exe = std::env::current_exe().unwrap();
    assert_eq!(resolve_trusted_executable("bun").unwrap(), exe);
    assert_eq!(
        resolve_trusted_executable(exe.to_str().unwrap()).unwrap(),
        exe
    );
    assert!(resolve_trusted_executable("./envden-fake-tool").is_err());
}
#[test]
fn subprocess_uses_sanitized_environment_and_propagates_failure() {
    #[cfg(unix)]
    {
        let options = ISpawnOptions {
            env: BTreeMap::from([("EXPLICIT".into(), Some("1".into()))]),
            ..Default::default()
        };
        let result = exec_trusted_sync(
            "sh",
            &["-c".into(), "printf '%s' \"$EXPLICIT\"".into()],
            &options,
        )
        .unwrap();
        assert_eq!(result, "1");
        assert_eq!(
            exec_trusted_sync("sh", &["-c".into(), "exit 7".into()], &Default::default())
                .unwrap_err()
                .message,
            "Subprocess failed"
        );
    }
}
#[test]
fn permissions_and_acl_arguments() {
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("file");
    fs::write(&file, "secret").unwrap();
    restrict_access(&file, false).unwrap();
    restrict_access_sync(root.path(), true).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        assert_eq!(fs::metadata(&file).unwrap().mode() & 0o777, 0o600);
        assert_eq!(fs::metadata(root.path()).unwrap().mode() & 0o777, 0o700);
    }
    assert_eq!(
        acl_arguments("path", false, "user"),
        ["path", "/inheritance:r", "/grant:r", "user:F"]
    );
    assert_eq!(
        acl_arguments("path", true, "user"),
        ["path", "/inheritance:r", "/grant:r", "user:(OI)(CI)F"]
    );
}
#[test]
fn subprocess_timeout_terminates_child() {
    #[cfg(unix)]
    {
        let options = ISpawnOptions {
            timeout: Some(10),
            ..Default::default()
        };
        let output = spawn_trusted("sh", &["-c".into(), "while :; do :; done".into()], &options)
            .unwrap()
            .wait_with_output()
            .unwrap();
        assert!(!output.status.success());
    }
}
