#![cfg(unix)]
use envden_adapter_shell_rc::{TShell, create_rc_shell_adapter};
use envden_core::adapters::IShellAdapter;
use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
    path::Path,
    process::Command,
};

fn run(shell: &str, script: &str, cwd: &Path, home: &Path, result: &Path) -> String {
    let output = Command::new(shell)
        .args(["-c", script])
        .current_dir(cwd)
        .env_clear()
        .env("HOME", home)
        .env("PATH", "/usr/bin:/bin")
        .env("BUN_OPTIONS", "poison")
        .env("BUN_BE_BUN", "1")
        .env("ENVDEN_TEST_RESULT", result)
        .output()
        .unwrap();
    assert!(output.status.success(), "{:?}", output.stderr);
    assert!(output.stderr.is_empty(), "{:?}", output.stderr);
    String::from_utf8(output.stdout).unwrap()
}

#[test]
fn approved_checkout_notices_and_sanitized_refresh() {
    for (shell, kind) in [("/bin/bash", TShell::Bash), ("/bin/zsh", TShell::Zsh)] {
        let home = tempfile::tempdir().unwrap();
        let home = fs::canonicalize(home.path()).unwrap();
        let state = home.join(".envden/state");
        let checkout = home.join("repo");
        let sibling = home.join("repo-other");
        let alias = home.join("alias");
        fs::create_dir_all(&state).unwrap();
        fs::create_dir(&checkout).unwrap();
        fs::create_dir(&sibling).unwrap();
        symlink(&checkout, &alias).unwrap();
        fs::write(
            state.join("approved-checkouts"),
            format!("{}\n", checkout.display()),
        )
        .unwrap();
        fs::write(state.join("notice"), "envden: out of sync\n").unwrap();
        let binary = home.join("envden");
        fs::write(&binary, "#!/bin/sh\n[ -z \"${BUN_OPTIONS+x}\" ] && [ -z \"${BUN_BE_BUN+x}\" ] && echo refreshed > \"$ENVDEN_TEST_RESULT\"\n").unwrap();
        fs::set_permissions(&binary, fs::Permissions::from_mode(0o700)).unwrap();
        let snippet = create_rc_shell_adapter(kind, &home, Some(&home.join(".envden")), None, None)
            .hook_snippet(binary.to_str().unwrap())
            .unwrap();
        let script = format!("{snippet}\n_envden_notice\n_envden_notice");
        let result = home.join("result");
        assert_eq!(
            run(shell, &script, &checkout, &home, &result)
                .matches("out of sync")
                .count(),
            1
        );
        assert_eq!(run(shell, &script, &sibling, &home, &result), "");
        assert_eq!(
            run(shell, &script, &alias, &home, &result)
                .matches("out of sync")
                .count(),
            1
        );
        let spelling = home.join("REPO");
        if spelling.exists() {
            assert_eq!(
                run(shell, &script, &spelling, &home, &result)
                    .matches("out of sync")
                    .count(),
                1
            );
        }
        assert!(!result.exists());
        let file = fs::File::options()
            .write(true)
            .open(state.join("notice"))
            .unwrap();
        file.set_times(fs::FileTimes::new().set_modified(std::time::UNIX_EPOCH))
            .unwrap();
        assert!(
            Command::new("/usr/bin/mkfifo")
                .arg(&result)
                .status()
                .unwrap()
                .success()
        );
        let reader_path = result.clone();
        let reader = std::thread::spawn(move || fs::read_to_string(reader_path).unwrap());
        run(shell, &script, &checkout, &home, &result);
        assert_eq!(reader.join().unwrap(), "refreshed\n");
    }
}

#[test]
fn track_offer_and_update_day_caches() {
    for (shell, kind) in [("/bin/bash", TShell::Bash), ("/bin/zsh", TShell::Zsh)] {
        let home = tempfile::tempdir().unwrap();
        let home = fs::canonicalize(home.path()).unwrap();
        let state = home.join(".envden/state");
        fs::create_dir_all(&state).unwrap();
        fs::write(state.join("track-offers"), format!("{}\n", home.display())).unwrap();
        fs::write(state.join("notice-update"), "envden: update available; run envden update\nenvden: update required; run envden update\nmalicious\x1b[31m\n").unwrap();
        fs::write(state.join("notice"), "").unwrap();
        let snippet = create_rc_shell_adapter(kind, &home, Some(&home.join(".envden")), None, None)
            .hook_snippet("/bin/true")
            .unwrap();
        let first = run(shell, &snippet, &home, &home, &home.join("result"));
        assert!(first.contains("run envden track"));
        assert!(first.contains("update available"));
        assert!(!first.contains("malicious"));
        assert_eq!(
            run(shell, &snippet, &home, &home, &home.join("result")),
            "envden: update required; run envden update\n"
        );
    }
}
