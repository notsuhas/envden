use envden_adapter_repo_git::{IGitRepoOptions, create_git_repo_adapter};
use envden_core::adapters::IRepoAdapter;
use std::{fs, path::Path, process::Command};

fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .env("HOME", root)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .unwrap();
    assert!(output.status.success(), "{:?}", output.stderr);
}

#[test]
fn sole_remote_alias_resolution_shared_worktrees_and_ambiguous_remotes() {
    let home = tempfile::tempdir().unwrap();
    let root = home.path().join("repo");
    fs::create_dir(&root).unwrap();
    git(&root, &["init", "-q"]);
    git(
        &root,
        &["remote", "add", "origin", "git@work:Team/Repo.git"],
    );
    git(&root, &["remote", "rename", "origin", "sole"]);
    fs::write(root.join("README"), "test").unwrap();
    git(&root, &["add", "README"]);
    git(
        &root,
        &[
            "-c",
            "user.name=test",
            "-c",
            "user.email=test@example.test",
            "commit",
            "-qm",
            "initial",
        ],
    );
    let other = root.join("other");
    git(
        &root,
        &["worktree", "add", "-qb", "other", other.to_str().unwrap()],
    );
    let adapter = create_git_repo_adapter(IGitRepoOptions {
        home: Some(home.path().to_string_lossy().into_owned()),
        resolve_ssh_host: Some(Box::new(|_| Ok("GitHub.com".into()))),
        ..Default::default()
    });
    let checkout = adapter
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    let worktree = adapter
        .checkout_at(other.to_str().unwrap())
        .unwrap()
        .unwrap();
    assert_eq!(checkout.repo_id, "github.com/team/repo");
    assert_eq!(worktree.registered_worktree, Some(true));
    assert_eq!(worktree.git_dir, checkout.git_dir);
    assert!(
        adapter.worktrees(&checkout).unwrap().contains(
            &fs::canonicalize(&other)
                .unwrap()
                .to_string_lossy()
                .into_owned()
        )
    );
    adapter.ensure_ignored(&worktree, ".env.local").unwrap();
    assert!(adapter.is_ignored(&worktree, ".env.local").unwrap());
    assert!(
        adapter
            .checkout_at(home.path().to_str().unwrap())
            .unwrap()
            .is_none()
    );
    git(&root, &["remote", "rename", "sole", "one"]);
    git(&root, &["remote", "add", "two", "https://host/other"]);
    assert!(
        adapter
            .checkout_at(root.to_str().unwrap())
            .unwrap_err()
            .message
            .contains("Choose")
    );
}
