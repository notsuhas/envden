use super::owner::{TProcess, process_identity, read_owner, reclaimable};
use crate::state::files::failure;
use envden_core::errors::Result;
use std::{fs, path::Path};

pub(super) fn try_reclaim(path: &Path, now: u64) -> Result<()> {
    let info = fs::symlink_metadata(path).map_err(failure)?;
    if !info.is_dir() || info.is_symlink() {
        return Ok(());
    }
    let previous = read_owner(path);
    let expired = match &previous {
        Some(owner) => {
            let identity = process_identity();
            let observed = if identity.is_some() && owner.identity == identity {
                super::process::process_start(owner.pid)
            } else {
                TProcess::Unknown
            };
            reclaimable(owner, &observed, identity.as_deref(), now)
        }
        None => {
            if fs::symlink_metadata(path.join("owner.json")).is_ok() {
                return Ok(());
            }
            info.modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .is_some_and(|t| now.saturating_sub(t.as_millis() as u64) >= 30_000)
        }
    };
    if !expired {
        return Ok(());
    }
    if !claim_guard(path, now)? {
        return Ok(());
    }
    let current = read_owner(path);
    if current.as_ref().map(|o| &o.token) != previous.as_ref().map(|o| &o.token) {
        let _ = fs::remove_dir(path.join("reclaim"));
        return Ok(());
    }
    let abandoned = path.with_extension(format!("lock.{}.abandoned", uuid::Uuid::new_v4()));
    fs::rename(path, &abandoned).map_err(failure)?;
    if read_owner(&abandoned).as_ref().map(|o| &o.token) != previous.as_ref().map(|o| &o.token) {
        fs::rename(&abandoned, path).map_err(failure)?;
        fs::remove_dir_all(path.join("reclaim")).map_err(failure)?;
        return Ok(());
    }
    fs::remove_dir_all(abandoned).map_err(failure)
}

fn claim_guard(path: &Path, now: u64) -> Result<bool> {
    let guard = path.join("reclaim");
    if fs::create_dir(&guard).is_err() {
        let old = fs::symlink_metadata(&guard)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .is_some_and(|t| now.saturating_sub(t.as_millis() as u64) >= 30_000);
        if !old {
            return Ok(false);
        }
        fs::remove_dir_all(&guard).map_err(failure)?;
        return claim_guard(path, now);
    }
    Ok(true)
}
