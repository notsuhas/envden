use crate::{
    adapters::IAdapters,
    output::home_path,
    settings::ensure_paths,
    state::files::{failure, optional_read},
    version::VERSION,
};
use envden_adapter_shell_rc::TShell;
use envden_core::{
    adapters::{INetworkStatus, THttpsCheck},
    errors::Result,
};
use serde_json::Value;
use std::fs;

pub struct IKeyReport {
    pub location: String,
    pub owner_only: bool,
}
pub struct IShellReport {
    pub shell: String,
    pub path: String,
    pub installed: bool,
}
pub struct IDoctorReport {
    pub keys: IKeyReport,
    pub symlinks: bool,
    pub update: Value,
    pub tailscale: INetworkStatus,
    pub https: THttpsCheck,
    pub shells: Vec<IShellReport>,
}

pub fn doctor(adapters: &IAdapters) -> Result<IDoctorReport> {
    ensure_paths(&adapters.home)?;
    let directory = adapters
        .home
        .join("state")
        .join(format!("doctor-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&directory).map_err(failure)?;
    let symlinks = (|| -> std::io::Result<()> {
        fs::write(directory.join("target"), "")?;
        #[cfg(unix)]
        std::os::unix::fs::symlink(directory.join("target"), directory.join("link"))?;
        #[cfg(windows)]
        std::os::windows::fs::symlink_file(directory.join("target"), directory.join("link"))?;
        Ok(())
    })()
    .is_ok();
    fs::remove_dir_all(directory).map_err(failure)?;
    let mut shells = Vec::new();
    for (name, shell) in [
        ("zsh", TShell::Zsh),
        ("bash", TShell::Bash),
        ("fish", TShell::Fish),
        ("powershell", TShell::Powershell),
    ] {
        let adapter = adapters.shell(shell);
        shells.push(IShellReport {
            shell: name.into(),
            path: adapter.rc_path(),
            installed: adapter.installed()?,
        });
    }
    let cache: Value = optional_read(&adapters.home.join("state/updates.json"))
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let available = cache["latest"].as_str().is_some_and(|v| {
        envden_protocol::protocol::compare_semver(v, VERSION)
            .is_ok_and(|n| n == std::cmp::Ordering::Greater)
    });
    let required =
        optional_read(&adapters.home.join("state/update-required"))?.as_deref() == Some(VERSION);
    let mut update = serde_json::json!({"available":available,"required":required});
    if let Some(message) = cache.get("message").filter(|v| v.is_string()) {
        update["message"] = message.clone();
    }
    Ok(IDoctorReport {
        keys: IKeyReport {
            location: home_path(
                &adapters.home,
                &adapters
                    .user_home
                    .canonicalize()
                    .unwrap_or_else(|_| adapters.user_home.clone()),
            ),
            owner_only: adapters.keychain.owner_only()?,
        },
        symlinks,
        update,
        tailscale: adapters.network.status()?,
        https: adapters.network.check_https_certificate()?,
        shells,
    })
}
