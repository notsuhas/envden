use envden_cli::{
    adapters::create_adapters,
    links::approval::checkout_value,
    state::{empty_state, repository::save_state},
    sync::{
        local::conflicts::{IConflictRecord, IConflictTarget, save_conflicts},
        resolve::resolve_conflict,
    },
};
use std::{fs, process::Command};

#[test]
fn resolution_skips_changed_checkout_local_only_and_changed_placement() {
    for scenario in ["remote", "local-only", "changed", "linked", "copy"] {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("checkout");
        fs::create_dir(&root).unwrap();
        let git = |args: &[&str]| {
            assert!(
                Command::new("git")
                    .arg("-C")
                    .arg(&root)
                    .args(args)
                    .output()
                    .unwrap()
                    .status
                    .success()
            )
        };
        git(&["init"]);
        git(&[
            "remote",
            "add",
            "origin",
            "https://github.com/original/project.git",
        ]);
        let home = dir.path().join("home");
        let adapters = create_adapters(Some(home.clone()), dir.path().into(), || 100);
        let checkout = adapters
            .repo
            .checkout_at(root.to_str().unwrap())
            .unwrap()
            .unwrap();
        let mut state = empty_state("test");
        state["approved"] = serde_json::json!([checkout_value(&checkout)]);
        let store = home.join("store/file");
        let file = home.join("conflicts/file");
        fs::create_dir_all(store.parent().unwrap()).unwrap();
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&store, b"old").unwrap();
        fs::write(file.with_extension("mine"), b"new").unwrap();
        let target = IConflictTarget {
            root: root.to_string_lossy().into(),
            path: ".env".into(),
            store: store.to_string_lossy().into(),
            mode: if scenario == "linked" { "link" } else { "copy" }.into(),
            local_only: None,
        };
        state["links"] = serde_json::json!([target]);
        match scenario {
            "remote" => git(&[
                "remote",
                "set-url",
                "origin",
                "https://github.com/other/project.git",
            ]),
            "local-only" => state["links"][0]["localOnly"] = true.into(),
            "changed" => state["links"][0]["mode"] = "link".into(),
            _ => {}
        }
        if scenario == "linked" {
            #[cfg(unix)]
            std::os::unix::fs::symlink(&store, root.join(".env")).unwrap();
        }
        save_state(&home, &state, &|| 100).unwrap();
        let record = IConflictRecord {
            remote: file.with_extension("remote").to_string_lossy().into(),
            alternatives: vec![],
            targets: vec![target],
            entry: None,
            store: store.to_string_lossy().into(),
            root: root.to_string_lossy().into(),
            path: ".env".into(),
            mode: "copy".into(),
            base: home.join("base/entry").to_string_lossy().into(),
            file: file.to_string_lossy().into(),
            server: file.with_extension("server").to_string_lossy().into(),
            mine: file.with_extension("mine").to_string_lossy().into(),
            deleted: false,
            mine_deleted: false,
        };
        save_conflicts(&home, &[record], 100).unwrap();
        let result = resolve_conflict(&adapters, Some(".env"), None, "keep-mine", &root).unwrap();
        if matches!(scenario, "linked" | "copy") {
            assert_eq!(fs::read(root.join(".env")).unwrap(), b"new", "{scenario}");
        } else {
            assert!(!root.join(".env").exists(), "{scenario}");
            assert_eq!(result["placementReports"].as_array().unwrap().len(), 1);
        }
        assert_eq!(fs::read(&store).unwrap(), b"new");
    }
}
