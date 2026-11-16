use crate::{
    TShell, create_rc_shell_adapter,
    profile::{bash, powershell_with_runner},
};
use envden_core::{
    adapters::IShellAdapter,
    errors::{EnvdenError, ErrorCode},
};
use std::{
    fs,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

#[test]
fn bash_login_profile_matrix() {
    let home = tempfile::tempdir().unwrap();
    assert_eq!(
        bash(home.path(), "darwin").unwrap(),
        home.path().join(".bash_profile")
    );
    fs::write(home.path().join(".bash_profile"), "# user\n").unwrap();
    assert_eq!(
        bash(home.path(), "darwin").unwrap(),
        home.path().join(".bash_profile")
    );
    fs::write(
        home.path().join(".bash_profile"),
        "source \"$HOME/.bashrc\"\n",
    )
    .unwrap();
    assert_eq!(
        bash(home.path(), "darwin").unwrap(),
        home.path().join(".bashrc")
    );
    assert_eq!(
        bash(home.path(), "linux").unwrap(),
        home.path().join(".bashrc")
    );
    for (file, content, expected) in [
        (".profile", "# user", ".profile"),
        (".bash_login", "# user", ".bash_login"),
        (".bashrc", "# >>> envden >>>", ".bashrc"),
        (
            ".bash_profile",
            "[ -f ~/.bashrc ] && . ~/.bashrc",
            ".bashrc",
        ),
        (".bash_profile", "if true; then . ~/.bashrc; fi", ".bashrc"),
        (
            ".bash_profile",
            "[[ -r ~/.bashrc ]] && source ~/.bashrc",
            ".bashrc",
        ),
        (".bash_profile", "# source ~/.bashrc", ".bash_profile"),
        (".bash_profile", "source\u{feff}~/.bashrc", ".bashrc"),
        (".bash_profile", "source\u{85}~/.bashrc", ".bash_profile"),
        (
            ".bash_profile",
            "\u{feff}# source ~/.bashrc",
            ".bash_profile",
        ),
        (".bash_profile", "\u{85}# source ~/.bashrc", ".bashrc"),
    ] {
        let home = tempfile::tempdir().unwrap();
        fs::write(home.path().join(file), content).unwrap();
        assert_eq!(
            bash(home.path(), "darwin").unwrap(),
            home.path().join(expected)
        );
    }
}

#[test]
fn powershell_runner_and_redirected_profile() {
    let home = tempfile::tempdir().unwrap();
    let redirected = home
        .path()
        .join("OneDrive/Documents/Microsoft.PowerShell_profile.ps1");
    let mut calls = Vec::new();
    let result = powershell_with_runner(home.path(), |name, args, options| {
        calls.push(name.to_owned());
        assert_eq!(options.timeout, Some(5000));
        assert_eq!(
            args,
            [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "$PROFILE.CurrentUserCurrentHost"
            ]
        );
        if name == "pwsh" {
            return Err(EnvdenError::new(ErrorCode::Internal, "missing"));
        }
        Ok(format!("{}\r\n", redirected.display()))
    });
    assert_eq!(calls, ["pwsh", "powershell"]);
    assert_eq!(result, Some(redirected.clone()));
    let adapter = create_rc_shell_adapter(
        TShell::Powershell,
        home.path(),
        None,
        None,
        Some(Box::new(move || Some(redirected.clone()))),
    );
    assert_eq!(
        adapter.rc_path().unwrap(),
        result.unwrap().to_string_lossy()
    );
    assert_eq!(
        powershell_with_runner(home.path(), |_, _, _| Err(EnvdenError::new(
            ErrorCode::Internal,
            "missing"
        ))),
        None
    );
}

#[test]
fn profiles_validate_output_prefer_existing_hook_and_cache_resolution() {
    let home = tempfile::tempdir().unwrap();
    let modern = home
        .path()
        .join("Documents/PowerShell/Microsoft.PowerShell_profile.ps1");
    let legacy = home
        .path()
        .join("Documents/WindowsPowerShell/Microsoft.PowerShell_profile.ps1");
    fs::create_dir_all(legacy.parent().unwrap()).unwrap();
    fs::write(&legacy, "# >>> envden >>>").unwrap();
    assert_eq!(
        powershell_with_runner(home.path(), |name, _, _| Ok(if name == "pwsh" {
            &modern
        } else {
            &legacy
        }
        .to_string_lossy()
        .into())),
        Some(legacy)
    );
    let redirected = home
        .path()
        .join("redirected/Microsoft.PowerShell_profile.ps1")
        .to_string_lossy()
        .into_owned();
    let other_home = home.path().join("home");
    assert_eq!(
        powershell_with_runner(&other_home, |_, _, _| Ok(redirected.clone())),
        Some(redirected.clone().into())
    );
    for path in [
        "relative/Microsoft.PowerShell_profile.ps1".into(),
        redirected.replace("redirected", "bad\0path"),
        format!("{redirected}/extra"),
        redirected.replace("redirected", "bad\tpath"),
        format!("{redirected}\r"),
        home.path().join("../outside.ps1").to_string_lossy().into(),
    ] {
        assert_eq!(
            powershell_with_runner(&other_home, |_, _, _| Ok(path.clone())),
            None
        );
    }
    let count = Arc::new(AtomicUsize::new(0));
    let captured = count.clone();
    let adapter = create_rc_shell_adapter(
        TShell::Powershell,
        home.path(),
        None,
        None,
        Some(Box::new(move || {
            captured.fetch_add(1, Ordering::SeqCst);
            Some(redirected.clone().into())
        })),
    );
    assert_eq!(adapter.rc_path().unwrap(), adapter.rc_path().unwrap());
    assert_eq!(count.load(Ordering::SeqCst), 1);
}

#[test]
#[cfg(target_os = "macos")]
fn bash_candidate_errors_are_not_hidden_by_installed_marker() {
    let home = tempfile::tempdir().unwrap();
    fs::write(home.path().join(".bashrc"), "# >>> envden >>>\n").unwrap();
    fs::create_dir(home.path().join(".bash_login")).unwrap();
    let adapter = create_rc_shell_adapter(TShell::Bash, home.path(), None, None, None);
    assert!(adapter.installed().is_err());
}

#[test]
fn bash_profile_decodes_invalid_utf8_like_node() {
    let home = tempfile::tempdir().unwrap();
    fs::write(home.path().join(".profile"), b"\xff# >>> envden >>>").unwrap();
    assert_eq!(
        bash(home.path(), "darwin").unwrap(),
        home.path().join(".profile")
    );
}
