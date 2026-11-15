use regex::Regex;

pub fn stable_executable(path: &str) -> String {
    if let Some(paths) = brew_paths(path) {
        return paths.1;
    }
    for pattern in [
        r"(?i)^([a-z]:/.*/scoop/apps/envden/)[^\\/]+(/)",
        r"(?i)^([a-z]:\\.*\\scoop\\apps\\envden\\)[^\\/]+(\\)",
    ] {
        let pattern = Regex::new(pattern).unwrap();
        if pattern.is_match(path) {
            return pattern.replace(path, "${1}current${2}").into_owned();
        }
    }

    path.into()
}

fn brew_paths(path: &str) -> Option<(String, String)> {
    let cellar = Regex::new(r"^(/.*)/Cellar/envden/").unwrap();
    let prefix = cellar
        .captures(path)
        .map(|m| m[1].to_string())
        .or_else(|| {
            Regex::new(r"^/(opt/homebrew|usr/local)/(bin|opt/envden/bin)/envden$")
                .unwrap()
                .captures(path)
                .map(|m| format!("/{}", &m[1]))
        })?;
    Some((format!("{prefix}/bin/brew"), format!("{prefix}/bin/envden")))
}

pub fn pinned_install(manager: &str, executable: &str) -> Option<(String, String)> {
    let path = executable.replace('\\', "/");
    if manager == "brew" {
        return brew_paths(&path);
    }
    let (pattern, tool, binary) = match manager {
        "scoop" => (
            r"(?i)^([a-z]:/.*/scoop)/apps/envden/",
            "shims/scoop.cmd",
            "shims/envden.exe",
        ),
        "winget" => (
            r"(?i)^([a-z]:/.*/AppData/Local)/Microsoft/WinGet/(?:Packages|Links)/",
            "Microsoft/WindowsApps/winget.exe",
            "Microsoft/WinGet/Links/envden.exe",
        ),
        "npm" => {
            let prefix = [r"^(/.*)/lib/node_modules/envden/", r"^(/.*)/bin/envden$"]
                .into_iter()
                .find_map(|pattern| {
                    Regex::new(pattern)
                        .unwrap()
                        .captures(&path)
                        .map(|m| m[1].to_string())
                });
            if let Some(prefix) = prefix {
                return Some((format!("{prefix}/bin/npm"), format!("{prefix}/bin/envden")));
            }
            let re =
                Regex::new(r"^([a-zA-Z]:/.*/npm)/(?:node_modules/envden/.*|envden(?:\.exe)?)$")
                    .unwrap();
            return re
                .captures(&path)
                .map(|m| (format!("{}/npm.cmd", &m[1]), executable.into()));
        }
        _ => return None,
    };
    Regex::new(pattern)
        .unwrap()
        .captures(&path)
        .map(|m| (format!("{}/{tool}", &m[1]), format!("{}/{binary}", &m[1])))
}

pub fn release_platform(platform: &str, arch: &str, glibc: Option<&str>) -> String {
    format!(
        "{}-{arch}{}",
        if platform == "win32" {
            "windows"
        } else {
            platform
        },
        if platform == "linux" && glibc.is_none_or(str::is_empty) {
            "-musl"
        } else {
            ""
        }
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stable_paths_and_release_variants() {
        assert_eq!(
            stable_executable("/opt/homebrew/Cellar/envden/0.2.0/bin/envden"),
            "/opt/homebrew/bin/envden"
        );
        assert_eq!(
            stable_executable(r"C:\Users\me\scoop\apps\envden\0.2.0\envden.exe"),
            r"C:\Users\me\scoop\apps\envden\current\envden.exe"
        );
        assert_eq!(release_platform("linux", "arm64", None), "linux-arm64-musl");
        assert_eq!(release_platform("linux", "x64", Some("2.36")), "linux-x64");
        assert_eq!(release_platform("win32", "x64", None), "windows-x64");
    }
    #[test]
    fn stable_scoop_paths_require_consistent_separators_and_ts_greediness() {
        for path in [
            r"C:/a/scoop/apps/envden/1\envden.exe",
            r"C:/a/scoop/apps/envden/1\nested/envden.exe",
            r"C:\a\scoop\apps\envden\1/nested\envden.exe",
            r"C:\a/scoop/apps/envden/1/envden.exe",
        ] {
            assert_eq!(stable_executable(path), path);
        }
        let path = "C:/a/scoop/apps/envden/1/scoop/apps/envden/2/envden.exe";
        assert_eq!(
            stable_executable(path),
            "C:/a/scoop/apps/envden/1/scoop/apps/envden/current/envden.exe"
        );
    }
    #[test]
    fn pinned_paths_follow_ts_prefix_precedence() {
        for (manager, binary, expected) in [
            (
                "npm",
                "/x/lib/node_modules/envden/sub/bin/envden",
                "/x/bin/npm",
            ),
            (
                "npm",
                "C:/x/npm/node_modules/envden/sub/npm/envden.exe",
                "C:/x/npm/node_modules/envden/sub/npm/npm.cmd",
            ),
            (
                "scoop",
                "C:/x/scoop/apps/envden/1/scoop/apps/envden/2/envden.exe",
                "C:/x/scoop/apps/envden/1/scoop/shims/scoop.cmd",
            ),
        ] {
            assert_eq!(pinned_install(manager, binary).unwrap().0, expected);
        }
    }
}
