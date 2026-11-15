use envden_core::errors::{EnvdenError, ErrorCode, Result};
use path_clean::PathClean;

#[derive(Clone, Copy)]
pub enum TShell {
    Bash,
    Zsh,
    Fish,
    Powershell,
}

impl TShell {
    pub(crate) fn name(self) -> &'static str {
        match self {
            Self::Bash => "bash",
            Self::Zsh => "zsh",
            Self::Fish => "fish",
            Self::Powershell => "powershell",
        }
    }
}

fn escape(shell: TShell, value: &str) -> String {
    match shell {
        TShell::Fish => value.replace('\\', "\\\\").replace('\'', "\\'"),
        TShell::Powershell => value
            .chars()
            .flat_map(|c| {
                if "'’‘‚‛".contains(c) {
                    vec![c, c]
                } else {
                    vec![c]
                }
            })
            .collect(),
        _ => value.replace('\'', "'\\''"),
    }
}

pub(crate) fn render(shell: TShell, binary: &str, home: &str) -> Result<String> {
    if !(std::path::Path::new(binary).is_absolute()
        || (cfg!(windows) && std::path::Path::new(binary).has_root()))
        || binary.contains(['\r', '\n'])
        || home.contains(['\r', '\n'])
    {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Hook paths must be absolute and single-line",
        ));
    }
    let template = match shell {
        TShell::Bash => include_str!("templates/bash.txt"),
        TShell::Zsh => include_str!("templates/zsh.txt"),
        TShell::Fish => include_str!("templates/fish.txt"),
        TShell::Powershell => include_str!("templates/powershell.txt"),
    };
    let pattern =
        regex::Regex::new(r"/__ENVDEN_BINARY__|/__ENVDEN_HOME__/state(?:/([a-z-]+))?").unwrap();
    Ok(pattern
        .replace_all(template, |captures: &regex::Captures<'_>| {
            if captures[0] == *"/__ENVDEN_BINARY__" {
                escape(shell, binary)
            } else {
                let mut path = std::path::Path::new(home).join("state");
                if let Some(suffix) = captures.get(1) {
                    path.push(suffix.as_str());
                }
                escape(shell, &path.clean().to_string_lossy())
            }
        })
        .into_owned())
}
