use crate::{links::takeover::sibling::normalize, output::sanitize_terminal};
use std::path::{Path, PathBuf};

pub(in crate::onboarding) fn rescan_command(
    command: &str,
    roots: Option<&[PathBuf]>,
    excluded: Option<&[PathBuf]>,
    home: &Path,
) -> String {
    let shown = |paths: &[PathBuf]| {
        paths
            .iter()
            .map(|path| {
                shell_path(
                    &normalize(&std::path::absolute(path).unwrap_or_else(|_| path.clone())),
                    home,
                )
            })
            .collect::<Vec<_>>()
            .join(" ")
    };
    if command == "track" {
        return sanitize_terminal(&format!(
            "envden track {}",
            shown(roots.unwrap_or(&[home.to_owned()]))
        ));
    }
    let mut parts = vec!["envden setup".to_owned()];
    if let Some(roots) = roots {
        parts.push(format!("--scan-root {}", shown(roots)));
    }
    if let Some(excluded) = excluded {
        parts.push(format!("--exclude-root {}", shown(excluded)));
    }
    sanitize_terminal(&parts.join(" "))
}

fn shell_path(path: &Path, home: &Path) -> String {
    match path.strip_prefix(home) {
        Ok(rest) if rest.as_os_str().is_empty() => "~".into(),
        Ok(rest) if !rest.to_string_lossy().starts_with("..") => {
            format!("~/{}", quoted(&rest.to_string_lossy()))
        }
        _ => quoted(&path.to_string_lossy()),
    }
}

fn quoted(text: &str) -> String {
    if text
        .bytes()
        .all(|c| c.is_ascii_alphanumeric() || b"_@%+=:,./-".contains(&c))
    {
        text.into()
    } else {
        format!("'{}'", text.replace('\'', "'\\''"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeats_the_requested_roots_and_quotes_spaces() {
        let home = Path::new("/tmp/home");
        let roots = [home.join("My Work")];
        assert_eq!(
            rescan_command("track", Some(&roots), None, home),
            "envden track ~/'My Work'"
        );
        assert_eq!(
            rescan_command("setup", Some(&roots), None, home),
            "envden setup --scan-root ~/'My Work'"
        );
        assert_eq!(rescan_command("track", None, None, home), "envden track ~");
    }
}
