pub fn platform() -> &'static str {
    if cfg!(windows) {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}
pub fn fixed_directories(platform: &str) -> Vec<String> {
    let dirs = if platform == "win32" {
        vec![
            r"C:\Windows\System32",
            r"C:\Windows\System32\OpenSSH",
            r"C:\Windows\System32\WindowsPowerShell\v1.0",
            r"C:\Program Files\PowerShell\7",
            r"C:\Program Files\Git\cmd",
            r"C:\Program Files\Tailscale",
        ]
    } else {
        let mut dirs = vec!["/usr/bin", "/bin", "/usr/sbin", "/sbin", "/usr/local/bin"];
        if platform == "darwin" {
            dirs.extend([
                "/opt/homebrew/bin",
                "/Applications/Tailscale.app/Contents/MacOS",
            ]);
        } else {
            dirs.extend(["/home/linuxbrew/.linuxbrew/bin", "/snap/bin"]);
        }
        dirs
    };
    dirs.into_iter().map(str::to_owned).collect()
}
pub fn manager_roots(platform: &str, arch: &str) -> Vec<String> {
    match platform {
        "darwin" => vec![
            if arch == "arm64" {
                "/opt/homebrew"
            } else {
                "/usr/local/Homebrew"
            }
            .to_owned(),
        ],
        "linux" => vec!["/home/linuxbrew/.linuxbrew".to_owned()],
        _ => vec![],
    }
}
