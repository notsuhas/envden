use super::*;
use crate::adapters::create_adapters;
use std::process::Command;

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

fn clone_at(root: &Path) {
    fs::create_dir_all(root).unwrap();
    git(root, &["init", "--quiet"]);
    git(
        root,
        &[
            "remote",
            "add",
            "origin",
            "https://example.com/org/repo.git",
        ],
    );
}

#[test]
fn discovers_hidden_registered_worktrees_and_skips_vendor_clones() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().canonicalize().unwrap();
    let root = home.join("main");
    clone_at(&root);
    git(
        &root,
        &[
            "-c",
            "user.name=fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "--allow-empty",
            "-m",
            "fixture",
            "--quiet",
        ],
    );
    let worktree = home.join(".hidden/branch");
    fs::create_dir_all(worktree.parent().unwrap()).unwrap();
    git(
        &root,
        &[
            "worktree",
            "add",
            "--quiet",
            "-b",
            "branch",
            worktree.to_str().unwrap(),
        ],
    );
    clone_at(&root.join("vendor/nested"));
    let second = home.join("second");
    clone_at(&second);
    clone_at(&home.join(".hidden/ignored"));
    let adapters = create_adapters(Some(home.join("config")), home.clone(), || 1);
    let result = discover_repos(
        &*adapters.repo,
        &IDiscoveryScope {
            roots: vec![home.clone()],
            excluded: vec![],
            home: Some(home.clone()),
        },
        &|_| {},
        &|_| {},
    );
    assert_eq!(
        result
            .iter()
            .map(|c| Path::new(&c.root))
            .collect::<Vec<_>>(),
        vec![worktree.as_path(), root.as_path(), second.as_path()]
    );
    let result = discover_repos(
        &*adapters.repo,
        &IDiscoveryScope {
            roots: vec![home.clone()],
            excluded: vec![root.clone(), worktree.clone()],
            home: Some(home),
        },
        &|_| {},
        &|_| {},
    );
    assert_eq!(result.len(), 1);
    assert_eq!(Path::new(&result[0].root), second);
}
