use envden_adapter_shell_rc::{TShell, create_rc_shell_adapter};
use envden_core::adapters::IShellAdapter;
use std::path::Path;

#[test]
fn rendered_shell_compatibility_guards() {
    let home = tempfile::tempdir().unwrap();
    let snippet = |shell| {
        create_rc_shell_adapter(shell, home.path(), None, None, None)
            .hook_snippet("/tmp/envden")
            .unwrap()
    };
    let fish = snippet(TShell::Fish);
    assert!(fish.find("stat -c %Y").unwrap() < fish.find("stat -f %m").unwrap());
    assert!(!fish.contains("path dirname"));
    let powershell = snippet(TShell::Powershell);
    for text in [
        "$global:EnvdenLastDirectory -cne $PWD.Path",
        "if ($changed)",
        "$info.Arguments = 'status --refresh-cache'",
    ] {
        assert!(powershell.contains(text));
    }
    assert!(!powershell.contains("ArgumentList"));
    let powershell = create_rc_shell_adapter(TShell::Powershell, home.path(), None, None, None)
        .hook_snippet("/tmp/a’‘‚‛b")
        .unwrap();
    assert!(powershell.contains("a’’‘‘‚‚‛‛b"));
    let fish = create_rc_shell_adapter(
        TShell::Fish,
        home.path(),
        Some(Path::new("/tmp/h\\'o")),
        None,
        None,
    )
    .hook_snippet("/tmp/a\\';echo INJECTED;#")
    .unwrap();
    assert!(fish.contains("'/tmp/a\\\\\\';echo INJECTED;#' status --refresh-cache"));
    assert!(fish.contains("'/tmp/h\\\\\\'o/state/notice'"));
}

#[cfg(unix)]
#[test]
fn bash_preserves_prompt_exit_status() {
    let home = tempfile::tempdir().unwrap();
    let snippet = create_rc_shell_adapter(TShell::Bash, home.path(), None, None, None)
        .hook_snippet("/bin/true")
        .unwrap();
    let output = std::process::Command::new("/bin/bash").args(["-c", &format!("{snippet}\nfalse; _envden_notice; printf '%s' \"$?\"; unset _envden_last_pwd; false; _envden_notice; printf '%s' \"$?\"")])
        .env_clear().env("HOME", home.path()).env("PATH", "/usr/bin:/bin").current_dir(home.path()).output().unwrap();
    assert!(output.status.success());
    assert_eq!(output.stdout, b"11");
}

#[cfg(target_os = "macos")]
#[test]
fn bash_selects_login_profiles_and_respects_bashrc_sourcing() {
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
    ] {
        let home = tempfile::tempdir().unwrap();
        std::fs::write(home.path().join(file), content).unwrap();
        assert_eq!(
            create_rc_shell_adapter(TShell::Bash, home.path(), None, None, None)
                .rc_path()
                .unwrap(),
            home.path().join(expected).to_string_lossy()
        );
    }
}
