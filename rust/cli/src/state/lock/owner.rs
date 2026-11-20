pub(super) use super::reclaim::try_reclaim;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, path::Path};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IOwner {
    pub pid: u32,
    pub started_at: String,
    pub token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity: Option<String>,
    pub created_at: f64,
}

pub enum TProcess {
    Live(String),
    Dead,
    Unknown,
}

pub fn linux_start(stat: &str) -> Option<String> {
    stat.rsplit_once(')')
        .and_then(|(_, tail)| tail.split_whitespace().nth(19))
        .filter(|s| s.bytes().all(|b| b.is_ascii_digit()))
        .map(str::to_string)
}

pub fn reclaimable(
    previous: &IOwner,
    observed: &TProcess,
    identity: Option<&str>,
    now: u64,
) -> bool {
    if identity.is_none() || previous.identity.as_deref() != identity {
        if let (Some(before), Some(current)) = (previous.identity.as_deref(), identity) {
            let before: Option<Value> = serde_json::from_str(before).ok();
            let current: Option<Value> = serde_json::from_str(current).ok();
            if let (Some(before), Some(current)) = (before, current)
                && before["host"].is_string()
                && before["host"] == current["host"]
                && before["boot"].is_string()
                && current["boot"].is_string()
                && before["boot"] != current["boot"]
            {
                return true;
            }
        }
        return now as f64 - previous.created_at >= 86_400_000.0;
    }
    matches!(observed, TProcess::Dead)
        || matches!(observed, TProcess::Live(start) if *start != previous.started_at)
}

pub(super) fn process_identity() -> Option<String> {
    let host = hostname::get().ok()?.to_string_lossy().into_owned();
    #[cfg(target_os = "linux")]
    let (boot, namespace) = (
        fs::read_to_string("/proc/sys/kernel/random/boot_id")
            .ok()?
            .trim()
            .to_string(),
        fs::read_link("/proc/self/ns/pid")
            .ok()?
            .to_string_lossy()
            .to_string(),
    );
    #[cfg(target_os = "macos")]
    let (boot, namespace) = {
        let output = std::process::Command::new("/usr/sbin/sysctl")
            .args(["-n", "kern.boottime"])
            .output()
            .ok()?;
        let value = String::from_utf8(output.stdout).ok()?;
        let seconds = value.split("sec = ").nth(1)?.split(',').next()?.trim();
        let micros = value.split("usec = ").nth(1)?.split('}').next()?.trim();
        (format!("{seconds}:{micros}"), String::new())
    };
    #[cfg(windows)]
    let (boot, namespace) = {
        let output = std::process::Command::new(
            envden_core::process::resolve_trusted_executable("powershell").ok()?,
        )
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().Ticks",
        ])
        .output()
        .ok()?;
        (
            String::from_utf8(output.stdout).ok()?.trim().to_string(),
            String::new(),
        )
    };
    Some(serde_json::json!({"host":host,"boot":boot,"namespace":namespace}).to_string())
}

pub(super) fn read_owner(path: &Path) -> Option<IOwner> {
    let directory = fs::symlink_metadata(path).ok()?;
    if !directory.is_dir() || directory.is_symlink() {
        return None;
    }
    let owner = path.join("owner.json");
    if fs::symlink_metadata(&owner).ok()?.is_symlink() {
        return None;
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_NONBLOCK);
    }
    let mut file = options.open(owner).ok()?;
    if !file.metadata().ok()?.is_file() {
        return None;
    }
    let mut text = String::new();
    std::io::Read::read_to_string(&mut file, &mut text).ok()?;
    let owner: IOwner = serde_json::from_str(&text).ok()?;
    (owner.pid > 0).then_some(owner)
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
