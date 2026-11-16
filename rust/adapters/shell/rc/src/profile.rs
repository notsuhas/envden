use crate::render::TShell;
use envden_core::errors::Result;
use std::{
    fs,
    path::{Path, PathBuf},
};

pub(crate) fn profile(shell: TShell, home: &Path) -> Result<PathBuf> {
    Ok(match shell {
        TShell::Zsh => home.join(".zshrc"),
        TShell::Fish => home.join(".config/fish/config.fish"),
        TShell::Powershell => powershell_default(home),
        TShell::Bash => {
            return bash(
                home,
                if cfg!(target_os = "macos") {
                    "darwin"
                } else {
                    "linux"
                },
            );
        }
    })
}

pub(crate) fn bash(home: &Path, platform: &str) -> Result<PathBuf> {
    if platform != "darwin" {
        return Ok(home.join(".bashrc"));
    }
    let mut files = Vec::new();
    for name in [".bashrc", ".bash_profile", ".bash_login", ".profile"] {
        let content = match fs::read(home.join(name)) {
            Ok(bytes) => Some(String::from_utf8_lossy(&bytes).into_owned()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(crate::edit::failure(error)),
        };
        files.push((name, content));
    }
    if let Some((name, _)) = files
        .iter()
        .find(|(_, s)| s.as_ref().is_some_and(|s| s.contains("# >>> envden >>>")))
    {
        return Ok(home.join(name));
    }
    let Some((name, Some(content))) = files[1..].iter().find(|(_, s)| s.is_some()) else {
        return Ok(home.join(".bash_profile"));
    };
    let source = regex::Regex::new(
        r#"(?:^|[[\s\u{feff}&&[^\u{85}]];&|])(?:source|\.)[\s\u{feff}&&[^\u{85}]]+["']?(?:~|\$HOME|\$\{HOME\})/\.bashrc["']?(?:[\s\u{feff}&&[^\u{85}]]|;|$)"#,
    )
    .unwrap();
    Ok(home.join(
        if content
            .split('\n')
            .any(|s| !envden_core::text::js_trim_start(s).starts_with('#') && source.is_match(s))
        {
            ".bashrc"
        } else {
            name
        },
    ))
}

pub(crate) fn powershell(home: &Path) -> Option<PathBuf> {
    use envden_core::process::exec_trusted_sync;

    powershell_with_runner(home, exec_trusted_sync)
}

pub(crate) fn powershell_with_runner(
    home: &Path,
    mut run: impl FnMut(
        &str,
        &[String],
        &envden_core::process::ISpawnOptions,
    ) -> envden_core::errors::Result<String>,
) -> Option<PathBuf> {
    use envden_core::process::ISpawnOptions;
    let mut candidates = Vec::new();
    for shell in ["pwsh", "powershell"] {
        let output = run(
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
            .map(|path| path.strip_suffix('\r').unwrap_or(path))
            .unwrap_or(&output);
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
        .find(|p| {
            fs::read(p).is_ok_and(|s| String::from_utf8_lossy(&s).contains("# >>> envden >>>"))
        })
        .cloned()
        .or_else(|| candidates.first().cloned())
}

pub(crate) fn powershell_default(home: &Path) -> PathBuf {
    home.join(if cfg!(windows) {
        "Documents/PowerShell/Microsoft.PowerShell_profile.ps1"
    } else {
        ".config/powershell/Microsoft.PowerShell_profile.ps1"
    })
}
