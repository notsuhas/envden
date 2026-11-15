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

pub fn with_state_lock<T>(home: &Path, now: u64, action: impl FnOnce() -> Result<T>) -> Result<T> {
    with_observer(home, now, action, || {
        super::process::process_start(std::process::id())
    })
}

fn with_observer<T>(
    home: &Path,
    now: u64,
    action: impl FnOnce() -> Result<T>,
    observe: impl FnOnce() -> super::owner::TProcess,
) -> Result<T> {
    with_timing_observer(
        home,
        &ILockTiming {
            now: &|| now,
            wait: &|delay| std::thread::sleep(std::time::Duration::from_millis(delay)),
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
                super::owner::try_reclaim(&path, (timing.now)())?;
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
        let _ = fs::remove_dir_all(path);
    }
    result
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn nested_lock_normalizes_parent_components_before_observing() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("child")).unwrap();
        with_state_lock(dir.path(), 100, || {
            with_observer(
                &dir.path().join("child/.."),
                100,
                || Ok(()),
                || panic!("nested ownership must be reused"),
            )
        })
        .unwrap();
    }

    #[test]
    fn failed_owner_identification_does_not_leave_a_lock() {
        let dir = tempfile::tempdir().unwrap();
        let error = with_observer(
            dir.path(),
            100,
            || Ok(()),
            || super::super::owner::TProcess::Unknown,
        )
        .unwrap_err();
        assert_eq!(error.code, ErrorCode::Internal);
        assert!(!dir.path().join("state/write.lock").exists());
    }

    #[test]
    fn lock_directory_is_private_and_nested_calls_share_owner() {
        let dir = tempfile::tempdir().unwrap();
        with_state_lock(dir.path(), 100, || {
            let path = dir.path().join("state/write.lock");
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o700
            );
            let owner = fs::read(path.join("owner.json")).unwrap();
            with_state_lock(dir.path(), 100, || {
                assert_eq!(fs::read(path.join("owner.json")).unwrap(), owner);
                Ok(())
            })
        })
        .unwrap();
        assert!(!dir.path().join("state/write.lock").exists());
    }
}
