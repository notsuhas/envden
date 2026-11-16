use super::*;
#[cfg(all(test, unix))]
mod cases {
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
            || super::super::super::owner::TProcess::Unknown,
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
