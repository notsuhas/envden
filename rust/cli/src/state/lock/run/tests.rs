use super::*;
#[cfg(all(test, unix))]
mod cases {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn nested_lock_normalizes_parent_components_before_observing() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("child")).unwrap();
        with_state_lock(dir.path(), &|| 100, || {
            with_observer(
                &dir.path().join("child/.."),
                &|| 100,
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
            &|| 100,
            || Ok(()),
            || super::super::super::owner::TProcess::Unknown,
        )
        .unwrap_err();
        assert_eq!(error.code, ErrorCode::Internal);
        assert!(!dir.path().join("state/write.lock").exists());
    }

    #[test]
    fn lock_directory_is_private_and_nested_calls_share_owner() {
        let dir = tempfile::tempdir().unwrap();
        with_state_lock(dir.path(), &|| 100, || {
            let path = dir.path().join("state/write.lock");
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o700
            );
            let owner = fs::read(path.join("owner.json")).unwrap();
            with_state_lock(dir.path(), &|| 100, || {
                assert_eq!(fs::read(path.join("owner.json")).unwrap(), owner);
                Ok(())
            })
        })
        .unwrap();
        assert!(!dir.path().join("state/write.lock").exists());
    }
}

#[test]
fn release_failure_replaces_success_or_action_error() {
    use std::os::unix::fs::PermissionsExt;

    for action_fails in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state/write.lock");
        let result = with_state_lock(dir.path(), &|| 100, || {
            fs::set_permissions(&path, fs::Permissions::from_mode(0o500)).unwrap();
            if action_fails {
                Err(EnvdenError::new(ErrorCode::Conflict, "Action failed"))
            } else {
                Ok(())
            }
        });
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();

        let error = result.unwrap_err();
        assert_eq!(error.code, ErrorCode::Internal);
        assert_eq!(crate::output::error_exit_code(error.code), 1);
        assert!(std::error::Error::source(&error).is_some());
    }
}

#[test]
fn default_lock_reads_injected_clock_for_each_check() {
    let dir = tempfile::tempdir().unwrap();
    let reads = std::cell::Cell::new(0);
    let now = || {
        reads.set(reads.get() + 1);
        100
    };

    with_state_lock(dir.path(), &now, || {
        assert!(reads.get() >= 2);
        Ok(())
    })
    .unwrap();
}

#[test]
fn waiting_lock_reclaims_after_crossing_each_stale_threshold() {
    for published in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state/write.lock");
        fs::create_dir_all(&path).unwrap();
        let threshold = if published { 86_400_000 } else { 30_000 };
        if published {
            fs::write(
                path.join("owner.json"),
                r#"{"pid":1,"token":"old","startedAt":"old","createdAt":100}"#,
            )
            .unwrap();
        } else {
            envden_testing::fixtures::set_modified(
                &path,
                std::time::UNIX_EPOCH + std::time::Duration::from_millis(100),
            )
            .unwrap();
        }
        let now = std::cell::Cell::new(100 + threshold - 1);
        let waits = std::cell::Cell::new(0);
        with_state_lock_timing(
            dir.path(),
            &ILockTiming {
                now: &|| now.get(),
                wait: &|delay| {
                    waits.set(waits.get() + 1);
                    now.set(now.get() + delay);
                },
                delays: &[1],
            },
            || {
                let owner = super::super::owner::read_owner(&path).unwrap();
                assert_eq!(owner.created_at, (100 + threshold) as f64);
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(waits.get(), 1);
        assert!(!path.exists());
    }
}
