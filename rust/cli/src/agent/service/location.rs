use std::path::{Path, PathBuf};

pub fn service_file(platform: &str, user_home: &Path, home: &Path) -> Option<PathBuf> {
    match platform {
        "darwin" => Some(user_home.join("Library/LaunchAgents/com.envden.server.plist")),
        "linux" => Some(user_home.join(".config/systemd/user/envden.service")),
        "win32" => Some(home.join("envden-task.xml")),
        _ => None,
    }
}
