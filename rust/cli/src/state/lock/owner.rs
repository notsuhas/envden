use crate::state::files::failure;
use envden_core::errors::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, path::Path, process::Command};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IOwner {
    pub pid: u32,
    pub token: String,
    pub started_at: String,
    pub identity: Option<String>,
    pub created_at: u64,
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
                && before["boot"] != current["boot"]
            {
                return true;
            }
        }
        return now.saturating_sub(previous.created_at) >= 86_400_000;
    }
    matches!(observed, TProcess::Dead)
        || matches!(observed, TProcess::Live(start) if *start != previous.started_at)
}

pub(super) fn process_identity() -> Option<String> {
    let host = String::from_utf8(Command::new("/bin/hostname").output().ok()?.stdout)
        .ok()?
        .trim()
        .to_string();
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
    #[cfg(not(target_os = "linux"))]
    let (boot, namespace) = {
        let output = Command::new("/usr/sbin/sysctl")
            .args(["-n", "kern.boottime"])
            .output()
            .ok()?;
        let value = String::from_utf8(output.stdout).ok()?;
        let seconds = value.split("sec = ").nth(1)?.split(',').next()?.trim();
        let micros = value.split("usec = ").nth(1)?.split('}').next()?.trim();
        (format!("{seconds}:{micros}"), String::new())
    };
    Some(serde_json::json!({"host":host,"boot":boot,"namespace":namespace}).to_string())
}

pub(super) fn try_reclaim(path: &Path, now: u64) -> Result<()> {
    let info = fs::symlink_metadata(path).map_err(failure)?;
    if !info.is_dir() || info.is_symlink() {
        return Ok(());
    }
    let previous = read_owner(path);
    let expired = match &previous {
        Some(owner) => {
            let identity = process_identity();
            let observed = match super::run::process_start(owner.pid) {
                Ok(start) => TProcess::Live(start),
                Err(_) => TProcess::Unknown,
            };
            reclaimable(owner, &observed, identity.as_deref(), now)
        }
        None => {
            if path.join("owner.json").exists() {
                return Ok(());
            }
            info.modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .is_some_and(|t| now.saturating_sub(t.as_millis() as u64) >= 30_000)
        }
    };
    if !expired || fs::create_dir(path.join("reclaim")).is_err() {
        return Ok(());
    }
    let current = read_owner(path);
    if current.as_ref().map(|o| &o.token) != previous.as_ref().map(|o| &o.token) {
        let _ = fs::remove_dir(path.join("reclaim"));
        return Ok(());
    }
    let abandoned = path.with_extension(format!("lock.{}.abandoned", uuid::Uuid::new_v4()));
    fs::rename(path, &abandoned).map_err(failure)?;
    fs::remove_dir_all(abandoned).map_err(failure)
}

fn read_owner(path: &Path) -> Option<IOwner> {
    let owner = path.join("owner.json");
    if fs::symlink_metadata(&owner).ok()?.is_symlink() {
        return None;
    }
    serde_json::from_str(&fs::read_to_string(owner).ok()?).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn owner_reclaim_matrix() {
        let owner = IOwner {
            pid: 1,
            token: "t".into(),
            started_at: "old".into(),
            identity: Some("same".into()),
            created_at: 100,
        };
        assert!(!reclaimable(
            &owner,
            &TProcess::Live("old".into()),
            Some("same"),
            200
        ));
        assert!(reclaimable(
            &owner,
            &TProcess::Live("new".into()),
            Some("same"),
            200
        ));
        assert!(reclaimable(&owner, &TProcess::Dead, Some("same"), 200));
        assert!(!reclaimable(&owner, &TProcess::Unknown, None, 200));
        assert!(reclaimable(&owner, &TProcess::Unknown, None, 86_400_100));
        assert_eq!(
            linux_start("1 (a b)) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 999 20"),
            Some("999".into())
        );
    }
}
