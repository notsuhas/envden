use crate::render::TShell;
use std::{
    fs,
    path::{Path, PathBuf},
};

pub(crate) fn profile(shell: TShell, home: &Path) -> PathBuf {
    match shell {
        TShell::Zsh => home.join(".zshrc"),
        TShell::Fish => home.join(".config/fish/config.fish"),
        TShell::Powershell => home.join(if cfg!(windows) {
            "Documents/PowerShell/Microsoft.PowerShell_profile.ps1"
        } else {
            ".config/powershell/Microsoft.PowerShell_profile.ps1"
        }),
        TShell::Bash => bash(home),
    }
}

fn bash(home: &Path) -> PathBuf {
    if !cfg!(target_os = "macos") {
        return home.join(".bashrc");
    }
    let files = [".bashrc", ".bash_profile", ".bash_login", ".profile"]
        .map(|s| (s, fs::read_to_string(home.join(s)).ok()));
    if let Some((name, _)) = files
        .iter()
        .find(|(_, s)| s.as_ref().is_some_and(|s| s.contains("# >>> envden >>>")))
    {
        return home.join(name);
    }
    let Some((name, Some(content))) = files[1..].iter().find(|(_, s)| s.is_some()) else {
        return home.join(".bash_profile");
    };
    let source = regex::Regex::new(
        r#"(?:^|[\s;&|])(?:source|\.)\s+["']?(?:~|\$HOME|\$\{HOME\})/\.bashrc["']?(?:\s|;|$)"#,
    )
    .unwrap();
    home.join(
        if content
            .lines()
            .any(|s| !s.trim_start().starts_with('#') && source.is_match(s))
        {
            ".bashrc"
        } else {
            name
        },
    )
}

pub(crate) fn powershell(home: &Path) -> Option<PathBuf> {
    use envden_core::process::{ISpawnOptions, exec_trusted_sync};

    let mut candidates = Vec::new();
    for shell in ["pwsh", "powershell"] {
        let output = exec_trusted_sync(
            shell,
            &[
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "$PROFILE.CurrentUserCurrentHost",
            ]
            .map(str::to_owned),
            &ISpawnOptions {
                timeout: Some(5000),
                ..Default::default()
            },
        );
        let Ok(output) = output else { continue };
        let path = output
            .strip_suffix('\n')
            .unwrap_or(&output)
            .strip_suffix('\r')
            .unwrap_or(output.strip_suffix('\n').unwrap_or(&output));
        let candidate = Path::new(path);
        if candidate.is_absolute()
            && candidate
                .file_name()
                .is_some_and(|s| s == "Microsoft.PowerShell_profile.ps1")
            && !path.chars().any(|c| c.is_control())
        {
            candidates.push(candidate.to_owned());
        }
    }
    let defaults = if cfg!(windows) {
        vec![
            home.join("Documents/PowerShell/Microsoft.PowerShell_profile.ps1"),
            home.join("Documents/WindowsPowerShell/Microsoft.PowerShell_profile.ps1"),
        ]
    } else {
        vec![home.join(".config/powershell/Microsoft.PowerShell_profile.ps1")]
    };
    candidates
        .iter()
        .chain(&defaults)
        .find(|p| fs::read_to_string(p).is_ok_and(|s| s.contains("# >>> envden >>>")))
        .cloned()
        .or_else(|| candidates.first().cloned())
}
