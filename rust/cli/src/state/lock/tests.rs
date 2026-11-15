use super::*;
#[test]
fn owner_accepts_reference_fractional_time_and_rejects_symlink_directory() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(
        dir.path().join("owner.json"),
        r#"{"pid":1,"token":"t","startedAt":"s","createdAt":100.5}"#,
    )
    .unwrap();
    assert!(read_owner(dir.path()).is_some());
    #[cfg(unix)]
    {
        let alias = dir.path().join("alias");
        std::os::unix::fs::symlink(dir.path(), &alias).unwrap();
        assert!(read_owner(&alias).is_none());
    }
}

#[test]
fn malformed_boot_identity_does_not_prove_a_reboot() {
    let owner = IOwner {
        pid: 1,
        token: "t".into(),
        started_at: "s".into(),
        identity: Some(r#"{"host":"same"}"#.into()),
        created_at: 100.0,
    };
    assert!(!reclaimable(
        &owner,
        &TProcess::Unknown,
        Some(r#"{"host":"same","boot":"new"}"#),
        101
    ));
}

#[test]
fn expired_reclaim_guard_does_not_block_recovery() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("write.lock");
    fs::create_dir(&path).unwrap();
    fs::create_dir(path.join("reclaim")).unwrap();
    let old = std::time::UNIX_EPOCH + std::time::Duration::from_millis(1);
    fs::File::open(path.join("reclaim"))
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(old))
        .unwrap();
    fs::File::open(&path)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(old))
        .unwrap();
    try_reclaim(&path, 100_000).unwrap();
    assert!(!path.exists());
}

#[test]
fn exited_same_machine_owner_is_reclaimed() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("write.lock");
    fs::create_dir(&path).unwrap();
    let mut child = Command::new("true").spawn().unwrap();
    let pid = child.id();
    child.wait().unwrap();
    let owner = IOwner {
        pid,
        token: "old".into(),
        started_at: "old".into(),
        identity: process_identity(),
        created_at: 100.0,
    };
    fs::write(path.join("owner.json"), serde_json::to_vec(&owner).unwrap()).unwrap();
    try_reclaim(&path, 100).unwrap();
    assert!(!path.exists());
}

#[test]
fn owner_reclaim_matrix() {
    let owner = IOwner {
        pid: 1,
        token: "t".into(),
        started_at: "old".into(),
        identity: Some("same".into()),
        created_at: 100.0,
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
