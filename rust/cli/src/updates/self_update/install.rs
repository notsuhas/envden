use crate::state::files::optional_read;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::path::{Path, PathBuf};

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
    let preferred = detected.or(recorded).or(environment);
    let marker = if preferred.is_none() {
        optional_read(&home.join("install-method"))?
    } else {
        None
    };
    let method = preferred.or(marker.as_deref());
    let method = match method {
        Some(method) => Some(method),
        None if resolved(binary.parent().unwrap_or(Path::new(".")))?
            == resolved(&home.join("bin"))? =>
        {
            Some("script")
        }
        None => None,
    };
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

fn resolved(path: &Path) -> Result<PathBuf> {
    let mut resolved = PathBuf::new();
    for component in std::path::absolute(path)
        .map_err(crate::state::files::failure)?
        .components()
    {
        match component {
            std::path::Component::ParentDir => {
                resolved.pop();
            }
            _ => resolved.push(component.as_os_str()),
        }
    }

    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_method_does_not_read_marker() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir(home.path().join("install-method")).unwrap();
        assert_eq!(
            install_method(home.path(), Some("script"), Path::new("/some/envden"), None).unwrap(),
            TInstallMethod::Script
        );
        assert!(matches!(
            install_method(
                home.path(),
                None,
                Path::new("/opt/homebrew/Cellar/envden/1/bin/envden"),
                None
            )
            .unwrap(),
            TInstallMethod::Manager(_)
        ));
    }

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
    #[test]
    fn script_detection_resolves_parent_components_and_relative_paths() {
        let root = tempfile::tempdir().unwrap();
        let binary = root.path().join("bin/../bin/envden");
        assert_eq!(
            install_method(root.path(), None, &binary, None).unwrap(),
            TInstallMethod::Script
        );
        let relative = Path::new("envden-home");
        assert_eq!(
            install_method(relative, None, &relative.join("bin/envden"), None).unwrap(),
            TInstallMethod::Script
        );
    }
}
