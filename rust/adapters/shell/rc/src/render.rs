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
    if !std::path::Path::new(binary).is_absolute()
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
    Ok(template
        .replace("/__ENVDEN_BINARY__", &escape(shell, binary))
        .replace(
            "/__ENVDEN_HOME__/state",
            &escape(
                shell,
                &std::path::Path::new(home)
                    .join("state")
                    .clean()
                    .to_string_lossy(),
            ),
        ))
}
