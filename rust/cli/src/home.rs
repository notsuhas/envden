use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{ffi::OsString, path::PathBuf};

pub fn home_directory() -> Result<PathBuf> {
    resolve_home(
        std::env::consts::OS,
        &|name| std::env::var_os(name),
        &system_home,
    )?
    .ok_or_else(|| EnvdenError::new(ErrorCode::Internal, "Could not determine home directory"))
}

fn resolve_home(
    platform: &str,
    env: &dyn Fn(&str) -> Option<OsString>,
    fallback: &dyn Fn() -> Result<Option<PathBuf>>,
) -> Result<Option<PathBuf>> {
    let value = |key| env(key).filter(|value| !value.is_empty());
    if platform == "windows" {
        if let Some(profile) = value("USERPROFILE") {
            return Ok(Some(profile.into()));
        }
        if let Some((mut drive, path)) = value("HOMEDRIVE").zip(value("HOMEPATH")) {
            drive.push(path);
            return Ok(Some(drive.into()));
        }
    } else if let Some(home) = value("HOME") {
        return Ok(Some(home.into()));
    }
    fallback()
}

fn system_home() -> Result<Option<PathBuf>> {
    #[cfg(unix)]
    {
        nix::unistd::User::from_uid(nix::unistd::geteuid())
            .map(|user| user.map(|user| user.dir))
            .map_err(|error| {
                EnvdenError::with_source(
                    ErrorCode::Internal,
                    "Could not determine home directory",
                    error,
                )
            })
    }
    #[cfg(not(unix))]
    {
        Ok(std::env::home_dir())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn home_precedence_matches_each_platform_without_touching_process_env() {
        for (platform, values, expected) in [
            (
                "linux",
                vec![("HOME", "/unix"), ("USERPROFILE", "C:\\wrong")],
                "/unix",
            ),
            ("macos", vec![], "/account"),
            ("linux", vec![("HOME", "")], "/account"),
            (
                "windows",
                vec![
                    ("HOME", "/wrong"),
                    ("USERPROFILE", "C:\\profile"),
                    ("HOMEDRIVE", "D:"),
                    ("HOMEPATH", "\\home"),
                ],
                "C:\\profile",
            ),
            (
                "windows",
                vec![
                    ("HOME", "/wrong"),
                    ("HOMEDRIVE", "D:"),
                    ("HOMEPATH", "\\home"),
                ],
                "D:\\home",
            ),
            (
                "windows",
                vec![
                    ("USERPROFILE", ""),
                    ("HOMEDRIVE", "D:"),
                    ("HOMEPATH", "\\home"),
                ],
                "D:\\home",
            ),
            ("windows", vec![("HOMEDRIVE", "D:")], "/account"),
        ] {
            let env = |key: &str| {
                values
                    .iter()
                    .find(|(name, _)| *name == key)
                    .map(|(_, value)| OsString::from(value))
            };
            assert_eq!(
                resolve_home(platform, &env, &|| Ok(Some("/account".into()))).unwrap(),
                Some(expected.into())
            );
        }
    }

    #[test]
    fn environment_home_does_not_probe_account_database() {
        assert_eq!(
            resolve_home(
                "linux",
                &|name| (name == "HOME").then(|| "/chosen".into()),
                &|| panic!("unexpected account lookup")
            )
            .unwrap(),
            Some("/chosen".into())
        );
    }
}
