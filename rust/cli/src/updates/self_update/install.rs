use crate::state::files::optional_read;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::path::Path;

#[derive(Debug, PartialEq, Eq)]
pub enum TInstallMethod {
    Script,
    Manager(Vec<String>),
}

pub fn install_method(
    home: &Path,
    recorded: Option<&str>,
    binary: &Path,
    environment: Option<&str>,
) -> Result<TInstallMethod> {
    let path = binary.to_string_lossy().replace('\\', "/");
    let detected = if path.contains("/Cellar/envden/") {
        Some("brew")
    } else if regex::Regex::new("(?i)/Microsoft/WinGet/(Packages|Links)/")
        .unwrap()
        .is_match(&path)
    {
        Some("winget")
    } else {
        None
    };
    let marker = optional_read(&home.join("install-method"))?;
    let method = detected
        .or(recorded)
        .or(environment)
        .or(marker.as_deref())
        .or_else(|| (binary.parent() == Some(home.join("bin").as_path())).then_some("script"));
    let command = match method {
        Some("script") => return Ok(TInstallMethod::Script),
        Some("brew") => vec!["brew", "upgrade", "envden"],
        Some("npm") => vec!["npm", "i", "-g", "envden@latest"],
        Some("scoop") => vec!["scoop", "update", "envden"],
        Some("winget") => vec!["winget", "upgrade", "envden"],
        _ => {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Install method is unknown; reinstall using your installer",
            ));
        }
    };
    Ok(TInstallMethod::Manager(
        command.into_iter().map(str::to_string).collect(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn markers_detection_and_precedence() {
        let temp = tempfile::tempdir().unwrap();
        assert_eq!(
            install_method(temp.path(), None, &temp.path().join("bin/envden"), None).unwrap(),
            TInstallMethod::Script
        );
        for manager in ["brew", "npm", "scoop", "winget"] {
            std::fs::write(temp.path().join("install-method"), manager).unwrap();
            assert!(matches!(
                install_method(temp.path(), None, Path::new("/some/envden"), None).unwrap(),
                TInstallMethod::Manager(_)
            ));
        }
        assert_eq!(
            install_method(
                temp.path(),
                Some("script"),
                Path::new("/opt/homebrew/bin/envden"),
                None
            )
            .unwrap(),
            TInstallMethod::Script
        );
        assert!(matches!(
            install_method(
                temp.path(),
                Some("script"),
                Path::new("/opt/homebrew/Cellar/envden/1/bin/envden"),
                None
            )
            .unwrap(),
            TInstallMethod::Manager(_)
        ));
        assert!(install_method(temp.path(), Some("unknown"), Path::new("/envden"), None).is_err());
    }
}
