use super::*;
#[test]
fn completed_sync_prunes_expired_placement_backups() {
    let (_dir, adapters, server, _) = fixture::fixture();
    let backup = adapters
        .home
        .join("conflicts/.envden-backup-1-00000000-0000-0000-0000-000000000000");
    std::fs::create_dir_all(backup.parent().unwrap()).unwrap();
    std::fs::write(&backup, b"previous").unwrap();
    let options = ISyncOptions {
        now: adapters.now,
        cwd: Some(adapters.user_home.clone()),
        all: true,
        yes: true,
        interactive: false,
        choose: None,
        confirm: None,
        report: None,
    };
    sync(&adapters, options, server, false).unwrap();
    assert!(!backup.exists());
}
