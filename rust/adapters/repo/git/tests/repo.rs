use envden_adapter_repo_git::{IGitRepoOptions, create_git_repo_adapter, normalize_repo_id};
use envden_core::{adapters::*, errors::ErrorCode};
use std::{fs, path::Path, process::Command};

fn run(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("HOME", root)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .unwrap();
    assert!(output.status.success(), "git fixture failed");
}

#[test]
fn worktrees_skip_folders_and_private_excludes() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("repo");
    fs::create_dir(&root).unwrap();
    run(&root, &["init", "-q"]);
    run(
        &root,
        &[
            "remote",
            "add",
            "origin",
            "https://github.com/Owner/Repo.git",
        ],
    );
    run(
        &root,
        &[
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.com",
            "commit",
            "--allow-empty",
            "-qm",
            "initial",
        ],
    );
    let worktree = temp.path().join("worktree");
    run(
        &root,
        &[
            "worktree",
            "add",
            "-qb",
            "other",
            worktree.to_str().unwrap(),
        ],
    );
    let adapter = create_git_repo_adapter(IGitRepoOptions {
        home: Some(temp.path().to_string_lossy().into_owned()),
        skip_folders: vec!["skip".into()],
        ..Default::default()
    });
    let checkout = adapter
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    let second = adapter
        .checkout_at(worktree.to_str().unwrap())
        .unwrap()
        .unwrap();
    assert_eq!(checkout.repo_id, "github.com/owner/repo");
    assert_eq!(checkout.git_dir, second.git_dir);
    assert_eq!(second.registered_worktree, Some(true));
    assert_eq!(adapter.worktrees(&checkout).unwrap().len(), 2);
    fs::write(root.join(".gitignore"), ".env*\n").unwrap();
    fs::write(root.join(".env"), "A=1").unwrap();
    fs::create_dir(root.join("skip")).unwrap();
    fs::write(root.join("skip/.env"), "A=2").unwrap();
    assert_eq!(adapter.env_files(&checkout, None).unwrap(), [".env"]);
    let name = "nested/space [x]*?.env";
    adapter.ensure_ignored(&checkout, name).unwrap();
    let exclude = Path::new(&checkout.git_dir).join("info/exclude");
    let once = fs::read(&exclude).unwrap();
    adapter.ensure_ignored(&checkout, name).unwrap();
    assert_eq!(fs::read(&exclude).unwrap(), once);
    assert!(String::from_utf8_lossy(&once).ends_with("\n/nested/space\\ \\[x\\]\\*\\?.env\n"));
    fs::write(root.join(".env.tracked"), "A=3").unwrap();
    run(&root, &["add", "-f", ".env.tracked"]);
    assert_eq!(
        adapter
            .ensure_ignored(&checkout, ".env.tracked")
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
}

#[test]
fn unsafe_remotes_and_readonly_case() {
    for remote in [
        "/tmp/local",
        "file:///tmp/repo",
        "https://host/a/../repo",
        "https://host/a%2f../repo",
        "git@host:a/../repo",
        "git@host:a%00b",
        "https://host/repo?token=x",
        "https://host/bad%zz",
    ] {
        assert!(
            normalize_repo_id(remote, None).is_err(),
            "accepted unsafe remote"
        );
    }
    let temp = tempfile::tempdir().unwrap();
    let adapter = create_git_repo_adapter(IGitRepoOptions::default());
    assert_eq!(
        adapter
            .case_insensitive(temp.path().to_str().unwrap(), true)
            .unwrap_err()
            .code,
        ErrorCode::NotImplemented
    );
    fs::write(temp.path().join("Probe"), "").unwrap();
    assert_eq!(
        adapter
            .case_insensitive(temp.path().to_str().unwrap(), true)
            .unwrap(),
        temp.path().join("probe").exists()
    );
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
}
