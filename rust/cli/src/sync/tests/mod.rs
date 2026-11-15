mod fixture;
use super::{engine::sync, remote::context::ISyncOptions};

#[test]
fn push_counts_conflicts_outside_selected_repositories() {
    let (_dir, adapters, server, _) = fixture::fixture();
    let home = &adapters.home;
    let path = |name: &str| home.join(name).to_string_lossy().into_owned();
    let record = crate::sync::local::conflicts::IConflictRecord {
        remote: path("conflicts/remote"),
        alternatives: vec![],
        targets: vec![],
        entry: None,
        store: path("store/unrelated"),
        root: path("unavailable"),
        path: ".env".into(),
        mode: "copy".into(),
        base: path("base/unrelated"),
        file: path("conflicts/file"),
        server: path("conflicts/server"),
        mine: path("conflicts/mine"),
        deleted: false,
        mine_deleted: false,
    };
    crate::sync::local::conflicts::save_conflicts(home, &[record], 1).unwrap();
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
    let result = sync(&adapters, options, server, true).unwrap();
    assert_eq!(result["conflicts"], 1);
    assert_eq!(result["kind"], "conflict");
}

mod move_follow;

mod prune;
mod repairs;
