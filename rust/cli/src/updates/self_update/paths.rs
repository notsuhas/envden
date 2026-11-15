use regex::Regex;

pub fn stable_executable(path: &str) -> String {
    if let Some(paths) = brew_paths(path) {
        return paths.1;
    }
    let pattern =
        Regex::new(r"(?i)^([a-z]:[\\/].*[\\/]scoop[\\/]apps[\\/]envden[\\/])[^\\/]+([\\/])")
            .unwrap();
    pattern.replace(path, "${1}current${2}").into_owned()
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
            r"(?i)^([a-z]:/.*?/scoop)/apps/envden/",
            "shims/scoop.cmd",
            "shims/envden.exe",
        ),
        "winget" => (
            r"(?i)^([a-z]:/.*?/AppData/Local)/Microsoft/WinGet/(?:Packages|Links)/",
            "Microsoft/WindowsApps/winget.exe",
            "Microsoft/WinGet/Links/envden.exe",
        ),
        "npm" => {
            let re = Regex::new(r"^(/.*)/(?:lib/node_modules/envden/.*|bin/envden)$").unwrap();
            if let Some(m) = re.captures(&path) {
                return Some((
                    format!("{}/bin/npm", &m[1]),
                    format!("{}/bin/envden", &m[1]),
                ));
            }
            let re =
                Regex::new(r"^([a-zA-Z]:/.*?/npm)/(?:node_modules/envden/.*|envden(?:\.exe)?)$")
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
}
