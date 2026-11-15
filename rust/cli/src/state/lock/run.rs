use crate::state::files::{failure, private_directory};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::{Value, json};
use std::{
    cell::RefCell,
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

thread_local! { static HELD: RefCell<HashSet<PathBuf>> = RefCell::default(); }

pub fn with_state_lock<T>(home: &Path, now: u64, action: impl FnOnce() -> Result<T>) -> Result<T> {
    let path = home.join("state/write.lock");
    if HELD.with(|held| held.borrow().contains(&path)) {
        return action();
    }
    private_directory(&home.join("state"))?;
    let mut acquired = false;
    for delay in [0, 50, 100, 200, 400, 800, 1000] {
        if delay > 0 {
            std::thread::sleep(std::time::Duration::from_millis(delay));
        }
        match fs::create_dir(&path) {
            Ok(()) => {
                acquired = true;
                break;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                super::owner::try_reclaim(&path, now)?;
            }
            Err(e) => return Err(failure(e)),
        }
    }
    if !acquired {
        return Err(EnvdenError::new(
            ErrorCode::Conflict,
            "State is locked; retry after the other command finishes",
        ));
    }
    let token = uuid::Uuid::new_v4().to_string();
    let result = (|| {
        let mut owner = json!({"pid":std::process::id(),"startedAt":process_start(std::process::id())?,"token":token,"createdAt":now});
        if let Some(identity) = super::owner::process_identity() {
            owner["identity"] = identity.into();
        }
        crate::state::files::atomic_write(
            &path.join("owner.json"),
            owner.to_string().as_bytes(),
            now,
        )?;
        HELD.with(|held| held.borrow_mut().insert(path.clone()));
        let result = action();
        HELD.with(|held| held.borrow_mut().remove(&path));
        result
    })();
    let owner: Option<Value> = fs::read_to_string(path.join("owner.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());
    if owner.as_ref().and_then(|v| v["token"].as_str()) == Some(&token) {
        let _ = fs::remove_dir_all(path);
    }
    result
}

pub(super) fn process_start(pid: u32) -> Result<String> {
    #[cfg(target_os = "linux")]
    {
        let stat = fs::read_to_string(format!("/proc/{pid}/stat")).map_err(failure)?;
        return stat
            .rsplit_once(')')
            .and_then(|(_, tail)| tail.split_whitespace().nth(19))
            .map(str::to_string)
            .ok_or_else(|| EnvdenError::new(ErrorCode::Internal, "Cannot identify lock owner"));
    }
    #[cfg(not(target_os = "linux"))]
    {
        let output = std::process::Command::new("/bin/ps")
            .args(["-p", &pid.to_string(), "-o", "lstart="])
            .env("LC_ALL", "C")
            .output()
            .map_err(failure)?;
        let start = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if start.is_empty() {
            return Err(EnvdenError::new(
                ErrorCode::Internal,
                "Cannot identify lock owner",
            ));
        }
        Ok(start)
    }
}
