use crate::{
    adapters::create_adapters,
    links::{local_only::mark_local_only, place::link_checkout},
    state::{empty_state, repository::load_state},
    sync::local::files::{base_path, read_bytes},
};
use std::{fs, path::Path, process::Command};

fn git(root: &Path, args: &[&str]) {
    assert!(
        Command::new("git")
            .arg("-C")
            .arg(root)
            .args(args)
            .output()
            .unwrap()
            .status
            .success()
    );
}

#[test]
fn placement_local_only_and_untrack_preserve_bytes() {
    for copy in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("repo");
        fs::create_dir_all(&root).unwrap();
        git(&root, &["init", "--quiet"]);
        git(
            &root,
            &[
                "remote",
                "add",
                "origin",
                "https://example.com/org/repo.git",
            ],
        );
        fs::write(root.join(".gitignore"), b".env\n").unwrap();
        fs::write(root.join(".env"), b"# comment\nA=1\r\n\n").unwrap();
        let adapters =
            create_adapters(Some(dir.path().join("home")), dir.path().to_owned(), || {
                1_800_000_000_000
            });
        let checkout = adapters
            .repo
            .checkout_at(root.to_str().unwrap())
            .unwrap()
            .unwrap();
        let mut state = empty_state("test");
        assert!(
            link_checkout(
                &adapters,
                &mut state,
                &checkout,
                &|_| Ok(true),
                copy,
                &|_| {}
            )
            .unwrap()
            .is_empty()
        );
        assert_eq!(state["links"].as_array().unwrap().len(), 1);
        let store = state["links"][0]["store"].as_str().unwrap().to_owned();
        assert_eq!(
            read_bytes(Path::new(&store)).unwrap().unwrap(),
            b"# comment\nA=1\r\n\n"
        );
        assert_eq!(
            fs::symlink_metadata(root.join(".env"))
                .unwrap()
                .is_symlink(),
            !copy
        );
        if copy {
            assert_eq!(
                read_bytes(&base_path(&adapters.home, &store, Some(&checkout.root)))
                    .unwrap()
                    .unwrap(),
                b"# comment\nA=1\r\n\n"
            );
        }
        mark_local_only(&adapters, &mut state, &checkout.root, ".env").unwrap();
        assert!(fs::symlink_metadata(root.join(".env")).unwrap().is_file());
        assert_eq!(state["links"][0]["localOnly"], true);
        super::untrack::untrack(&adapters, &checkout.root).unwrap();
        let state = load_state(&adapters.home).unwrap().unwrap();
        assert!(state["links"].as_array().unwrap().is_empty());
        assert!(state["approved"].as_array().unwrap().is_empty());
        assert_eq!(
            fs::read(root.join(".env")).unwrap(),
            b"# comment\nA=1\r\n\n"
        );
    }
}

#[cfg(unix)]
#[test]
fn takeover_and_untrack_restore_the_original_foreign_link() {
    use crate::{
        links::takeover::{adopt::adopt_group, group::group_own_links},
        state::repository::save_state,
    };
    use envden_core::adapters::TPlacementMode;
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("repo");
    fs::create_dir_all(&root).unwrap();
    git(&root, &["init", "--quiet"]);
    git(
        &root,
        &[
            "remote",
            "add",
            "origin",
            "https://example.com/org/repo.git",
        ],
    );
    fs::write(root.join(".gitignore"), b".env\n").unwrap();
    let external = dir.path().join("external.env");
    fs::write(&external, b"A=secret\n").unwrap();
    std::os::unix::fs::symlink("../external.env", root.join(".env")).unwrap();
    let adapters = create_adapters(Some(dir.path().join("home")), dir.path().to_owned(), || {
        1_800_000_000_000
    });
    let checkout = adapters
        .repo
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    let mut state = empty_state("test");
    let own = link_checkout(
        &adapters,
        &mut state,
        &checkout,
        &|_| Ok(true),
        false,
        &|_| {},
    )
    .unwrap();
    assert_eq!(own.len(), 1);
    let group = group_own_links(own).pop().unwrap();
    assert!(
        adopt_group(&adapters, &mut state, group, false)
            .unwrap()
            .is_empty()
    );
    let store = state["links"][0]["store"].as_str().unwrap();
    assert_eq!(state["links"][0]["originalLink"], "../external.env");
    assert_eq!(
        adapters
            .placement(TPlacementMode::Link, &root)
            .inspect(store, root.join(".env").to_str().unwrap())
            .unwrap(),
        envden_core::adapters::TPlacementState::Linked
    );
    save_state(&adapters.home, &state, &adapters.now).unwrap();
    super::untrack::untrack(&adapters, &checkout.root).unwrap();
    assert_eq!(
        fs::read_link(root.join(".env")).unwrap(),
        Path::new("../external.env")
    );
    assert_eq!(fs::read(&external).unwrap(), b"A=secret\n");
}
