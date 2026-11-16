use crate::state::lock::{ILockTiming, with_state_lock_timing};
use envden_core::errors::{ErrorCode, Result};
use std::{cell::RefCell, fs};

#[test]
fn empty_retry_delays_never_wait_or_run_the_action() {
    let dir = tempfile::tempdir().unwrap();
    let lock = dir.path().join("state/write.lock");
    fs::create_dir_all(&lock).unwrap();
    fs::write(
        lock.join("owner.json"),
        r#"{"pid":1,"token":"live","startedAt":"live","createdAt":9007199254740991}"#,
    )
    .unwrap();
    let error = with_state_lock_timing(
        dir.path(),
        &ILockTiming {
            now: &|| 100,
            wait: &|_| panic!("empty delays must not wait"),
            delays: &[],
        },
        || -> Result<()> { panic!("occupied lock must not run") },
    )
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::Conflict);
    assert!(lock.exists());
}

#[test]
fn retry_delays_use_the_injected_wait_and_clock() {
    let dir = tempfile::tempdir().unwrap();
    let lock = dir.path().join("state/write.lock");
    fs::create_dir_all(&lock).unwrap();
    fs::write(
        lock.join("owner.json"),
        r#"{"pid":1,"token":"live","startedAt":"live","createdAt":9007199254740991}"#,
    )
    .unwrap();
    let waits = RefCell::new(Vec::new());
    with_state_lock_timing(
        dir.path(),
        &ILockTiming {
            now: &|| 100,
            wait: &|delay| {
                waits.borrow_mut().push(delay);
                fs::remove_dir_all(&lock).unwrap();
            },
            delays: &[7],
        },
        || Ok(()),
    )
    .unwrap();
    assert_eq!(*waits.borrow(), vec![7]);
}
