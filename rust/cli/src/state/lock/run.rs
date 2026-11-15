use crate::state::files::{failure, private_directory};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

use std::{
    cell::RefCell,
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

thread_local! { static HELD: RefCell<HashSet<PathBuf>> = RefCell::default(); }

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
    let home = std::path::absolute(home).map_err(failure)?;
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
    for delay in [0, 50, 100, 200, 400, 800, 1000] {
        if delay > 0 {
            std::thread::sleep(std::time::Duration::from_millis(delay));
        }
        let mut builder = fs::DirBuilder::new();
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
            created_at: now as f64,
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
