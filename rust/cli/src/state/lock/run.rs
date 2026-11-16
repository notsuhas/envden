use crate::state::files::{failure, private_directory};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

use std::{
    cell::RefCell,
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

thread_local! { static HELD: RefCell<HashSet<PathBuf>> = RefCell::default(); }

fn resolved_home(home: &Path) -> Result<PathBuf> {
    let mut resolved = PathBuf::new();
    for part in std::path::absolute(home).map_err(failure)?.components() {
        match part {
            std::path::Component::ParentDir => {
                resolved.pop();
            }
            _ => resolved.push(part.as_os_str()),
        }
    }
    Ok(resolved)
}

pub struct ILockTiming<'a> {
    pub now: &'a dyn Fn() -> u64,
    pub wait: &'a dyn Fn(u64),
    pub delays: &'a [u64],
}

pub fn with_state_lock_timing<T>(
    home: &Path,
    timing: &ILockTiming<'_>,
    action: impl FnOnce() -> Result<T>,
) -> Result<T> {
    with_timing_observer(home, timing, action, || {
        super::process::process_start(std::process::id())
    })
}

pub fn with_state_lock<T>(
    home: &Path,
    now: &dyn Fn() -> u64,
    action: impl FnOnce() -> Result<T>,
) -> Result<T> {
    with_observer(home, now, action, || {
        super::process::process_start(std::process::id())
    })
}

fn with_observer<T>(
    home: &Path,
    now: &dyn Fn() -> u64,
    action: impl FnOnce() -> Result<T>,
    observe: impl FnOnce() -> super::owner::TProcess,
) -> Result<T> {
    with_timing_observer(
        home,
        &ILockTiming {
            now,
            wait: &crate::time::wait,
            delays: &[50, 100, 200, 400, 800, 1000],
        },
        action,
        observe,
    )
}

fn with_timing_observer<T>(
    home: &Path,
    timing: &ILockTiming<'_>,
    action: impl FnOnce() -> Result<T>,
    observe: impl FnOnce() -> super::owner::TProcess,
) -> Result<T> {
    let home = resolved_home(home)?;
    let path = home.join("state/write.lock");
    if HELD.with(|held| held.borrow().contains(&path)) {
        return action();
    }
    private_directory(&home.join("state"))?;
    let started_at = match observe() {
        super::owner::TProcess::Live(start) => start,
        _ => {
            return Err(EnvdenError::new(
                ErrorCode::Internal,
                "Cannot identify lock owner",
            ));
        }
    };
    let mut acquired = false;
    for (attempt, delay) in std::iter::once(0)
        .chain(timing.delays.iter().copied())
        .enumerate()
    {
        if attempt > 0 {
            (timing.wait)(delay);
        }
        let now = (timing.now)();
        let builder = fs::DirBuilder::new();
        #[cfg(unix)]
        let mut builder = builder;
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        match builder.create(&path) {
            Ok(()) => {
                acquired = true;
                break;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                super::owner::try_reclaim(&path, now)?;
                if builder.create(&path).is_ok() {
                    acquired = true;
                    break;
                }
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
    let before = super::publication::directory_identity(&path)?;
    let token = uuid::Uuid::new_v4().to_string();
    let result = (|| {
        let owner = super::owner::IOwner {
            pid: std::process::id(),
            token: token.clone(),
            started_at,
            identity: super::owner::process_identity(),
            created_at: (timing.now)() as f64,
        };
        super::publication::publish_owner(&path, &owner)?;
        let after = super::publication::directory_identity(&path)?;
        if before != after {
            return Err(EnvdenError::new(
                ErrorCode::Conflict,
                "Lock ownership changed",
            ));
        }
        HELD.with(|held| held.borrow_mut().insert(path.clone()));
        let result = action();
        HELD.with(|held| held.borrow_mut().remove(&path));
        result
    })();
    if super::owner::read_owner(&path).as_ref().map(|o| &o.token) == Some(&token) {
        fs::remove_dir_all(path).map_err(failure)?;
    }
    result
}

#[cfg(all(test, unix))]
mod tests;
