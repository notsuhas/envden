#![cfg(unix)]
use envden_adapter_repo_git::{IGitRepoOptions, create_git_repo_adapter};
use envden_core::adapters::*;
use std::{fs, os::unix::fs::symlink, path::Path, process::Command};

fn git(root: &Path, args: &[&str]) {
    let result = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("HOME", root)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
}

#[test]
fn exclude_preserves_symlinks_hardlinks_and_failed_edits() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("repo");
    fs::create_dir(&root).unwrap();
    git(&root, &["init", "-q"]);
    git(
        &root,
        &["remote", "add", "origin", "https://github.com/team/repo"],
    );
    let adapter = create_git_repo_adapter(IGitRepoOptions {
        home: Some(temp.path().to_string_lossy().into()),
        ..Default::default()
    });
    let checkout = adapter
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    let protected = temp.path().join("protected");
    fs::write(&protected, "keep\n").unwrap();
    symlink(&protected, root.join(".gitignore")).unwrap();
    adapter.ensure_ignored(&checkout, ".env").unwrap();
    assert!(adapter.is_ignored(&checkout, ".env").unwrap());
    assert!(root.join(".gitignore").is_symlink());
    assert_eq!(fs::read(&protected).unwrap(), b"keep\n");
    fs::remove_file(root.join(".gitignore")).unwrap();
    let exclude = root.join(".git/info/exclude");
    fs::remove_file(&exclude).unwrap();
    symlink(&protected, &exclude).unwrap();
    assert!(adapter.ensure_ignored(&checkout, ".env.local").is_err());
    assert_eq!(fs::read(&protected).unwrap(), b"keep\n");
    fs::remove_file(&exclude).unwrap();
    fs::hard_link(&protected, &exclude).unwrap();
    assert!(adapter.ensure_ignored(&checkout, ".env.local").is_err());
    assert_eq!(fs::read(&protected).unwrap(), b"keep\n");
    fs::remove_file(&exclude).unwrap();
    fs::write(&exclude, "# existing\n").unwrap();
    fs::write(root.join(".gitignore"), "!.env.keep\n").unwrap();
    let before = fs::read(&exclude).unwrap();
    assert!(adapter.ensure_ignored(&checkout, ".env.keep").is_err());
    assert_eq!(fs::read(&exclude).unwrap(), before);
    fs::remove_dir_all(root.join(".git/info")).unwrap();
    symlink(temp.path(), root.join(".git/info")).unwrap();
    assert!(adapter.ensure_ignored(&checkout, ".env.local").is_err());
    assert_eq!(fs::read(&protected).unwrap(), b"keep\n");
}

#[test]
fn checkout_identity_errors_upstream_and_forged_worktree() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("repo");
    fs::create_dir(&root).unwrap();
    git(&root, &["init", "-q"]);
    git(
        &root,
        &["remote", "add", "origin", "https://github.com/team/repo"],
    );
    git(
        &root,
        &[
            "remote",
            "add",
            "upstream",
            "https://GitHub.com/Upstream/Project.git",
        ],
    );
    let adapter = create_git_repo_adapter(IGitRepoOptions {
        home: Some(temp.path().to_string_lossy().into()),
        ..Default::default()
    });
    let checkout = adapter
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    assert_eq!(checkout.repo_id, "github.com/team/repo");
    assert_eq!(
        checkout.upstream_repo_id.as_deref(),
        Some("github.com/upstream/project")
    );
    let forged = root.join("forged");
    fs::create_dir(&forged).unwrap();
    fs::write(
        forged.join(".git"),
        format!("gitdir: {}\n", root.join(".git").display()),
    )
    .unwrap();
    assert_eq!(
        adapter
            .checkout_at(forged.to_str().unwrap())
            .unwrap()
            .unwrap()
            .registered_worktree,
        Some(false)
    );
    assert!(
        adapter
            .checkout_at(root.join("missing").to_str().unwrap())
            .is_err()
    );
    assert!(
        adapter
            .checkout_at(temp.path().to_str().unwrap())
            .unwrap()
            .is_none()
    );
    git(&root, &["remote", "rename", "origin", "one"]);
    let error = adapter.checkout_at(root.to_str().unwrap()).unwrap_err();
    assert!(error.message.contains("Choose"));
    fs::remove_dir_all(root.join(".git")).unwrap();
    let error = adapter.ensure_ignored(&checkout, ".env").unwrap_err();
    assert!(!error.message.contains("fatal:"));
}

#[test]
fn discovery_filters_templates_tracked_outputs_and_preserves_user_links() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("repo");
    fs::create_dir(&root).unwrap();
    git(&root, &["init", "-q"]);
    git(
        &root,
        &["remote", "add", "origin", "https://github.com/team/repo"],
    );
    for dir in ["apps", "dist", "nested"] {
        fs::create_dir(root.join(dir)).unwrap();
    }
    for path in [
        ".env",
        ".env.local",
        ".env.example",
        ".envrc",
        ".env.production.defaults",
        "apps/.env",
        "dist/.env",
        ".env.tracked",
        ".env.visible",
        "nested/.env",
    ] {
        fs::write(root.join(path), "A=1\n").unwrap();
    }
    git(&root, &["add", ".env.tracked"]);
    fs::write(root.join(".gitignore"), ".env*\n!.env.visible\n").unwrap();
    git(&root.join("nested"), &["init", "-q"]);
    let protected = temp.path().join("secret");
    fs::write(&protected, "A=1\n").unwrap();
    symlink(&protected, root.join(".env.link")).unwrap();
    let adapter = create_git_repo_adapter(IGitRepoOptions {
        home: Some(temp.path().to_string_lossy().into()),
        ..Default::default()
    });
    let checkout = adapter
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    assert_eq!(
        adapter.env_files(&checkout, None).unwrap(),
        [".env", ".env.link", ".env.local", "apps/.env"]
    );
    assert!(!adapter.is_ignored(&checkout, ".env.tracked").unwrap());
    assert!(
        adapter
            .ensure_ignored(&checkout, ".env.tracked")
            .unwrap_err()
            .message
            .contains("tracked")
    );
}
