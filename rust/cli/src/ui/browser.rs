use envden_core::process::{ISpawnOptions, TStdio, exec_trusted};

pub fn browser_command(platform: &str, url: &str) -> Vec<String> {
    match platform {
        "darwin" => vec!["open", url],
        "win32" => vec!["rundll32", "url.dll,FileProtocolHandler", url],
        _ => vec!["xdg-open", url],
    }
    .into_iter()
    .map(str::to_string)
    .collect()
}

pub fn open_browser(url: &str) -> bool {
    let command = browser_command(
        if cfg!(target_os = "macos") {
            "darwin"
        } else if cfg!(windows) {
            "win32"
        } else {
            "linux"
        },
        url,
    );
    exec_trusted(
        &command[0],
        &command[1..],
        &ISpawnOptions {
            stdout: Some(TStdio::Ignore),
            stderr: Some(TStdio::Ignore),
            ..Default::default()
        },
    )
    .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn platform_commands_pass_url_as_argument() {
        assert_eq!(browser_command("darwin", "a&b"), vec!["open", "a&b"]);
        assert_eq!(
            browser_command("win32", "url"),
            vec!["rundll32", "url.dll,FileProtocolHandler", "url"]
        );
        assert_eq!(browser_command("linux", "url"), vec!["xdg-open", "url"]);
    }
}
