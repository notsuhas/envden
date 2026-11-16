#![cfg(unix)]
use envden_adapter_repo_git::{IGitRepoOptions, create_git_repo_adapter};
use envden_core::adapters::IRepoAdapter;
use std::{fs, os::unix::fs::symlink, path::Path, process::Command};

fn git(root: &Path, args: &[&str]) {
    assert!(
        Command::new("git")
            .arg("-C")
            .arg(root)
            .args(args)
            .env_clear()
            .env("PATH", std::env::var_os("PATH").unwrap_or_default())
            .envs(
                ["SYSTEMROOT", "COMSPEC", "TEMP", "TMP"]
                    .into_iter()
                    .filter_map(|key| std::env::var_os(key).map(|value| (key, value)))
            )
            .env("HOME", root)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .output()
            .unwrap()
            .status
            .success()
    );
}

#[test]
fn linked_gitignore_is_never_written() {
    let home = tempfile::tempdir().unwrap();
    let root = home.path().join("repo");
    fs::create_dir(&root).unwrap();
    git(&root, &["init", "-q"]);
    git(
        &root,
        &["remote", "add", "origin", "git@work:Team/Repo.git"],
    );
    let adapter = create_git_repo_adapter(IGitRepoOptions {
        home: Some(home.path().to_string_lossy().into()),
        resolve_ssh_host: Some(Box::new(|_| Ok("GitHub.com".into()))),
        ..Default::default()
    });
    let checkout = adapter
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    let shared = home.path().join("repo-gitignore");
    fs::write(&shared, "node_modules\n").unwrap();
    symlink(&shared, root.join(".gitignore")).unwrap();
    adapter.ensure_ignored(&checkout, ".env").unwrap();
    assert!(adapter.is_ignored(&checkout, ".env").unwrap());
    assert!(root.join(".gitignore").is_symlink());
    assert_eq!(fs::read(&shared).unwrap(), b"node_modules\n");
    assert!(
        fs::read_to_string(root.join(".git/info/exclude"))
            .unwrap()
            .contains("\n/.env\n")
    );
}

#[test]
fn symlink_and_hardlink_excludes_preserve_exact_target_bytes() {
    for hardlink in [false, true] {
        let home = tempfile::tempdir().unwrap();
        let root = home.path();
        git(root, &["init", "-q"]);
        git(
            root,
            &["remote", "add", "origin", "https://github.com/team/repo"],
        );
        let adapter = create_git_repo_adapter(IGitRepoOptions {
            home: Some(root.to_string_lossy().into()),
            ..Default::default()
        });
        let checkout = adapter
            .checkout_at(root.to_str().unwrap())
            .unwrap()
            .unwrap();
        let target = root.join(if hardlink { "protected" } else { "rc" });
        fs::write(&target, "keep").unwrap();
        let exclude = root.join(".git/info/exclude");
        fs::remove_file(&exclude).unwrap();
        if hardlink {
            fs::hard_link(&target, &exclude).unwrap();
        } else {
            symlink(&target, &exclude).unwrap();
        }
        assert!(adapter.ensure_ignored(&checkout, ".env").is_err());
        assert_eq!(fs::read(&target).unwrap(), b"keep");
        if !hardlink {
            fs::remove_dir_all(root.join(".git/info")).unwrap();
            symlink(root, root.join(".git/info")).unwrap();
            assert!(adapter.ensure_ignored(&checkout, ".env").is_err());
            assert_eq!(fs::read(&target).unwrap(), b"keep");
        }
    }
}

#[test]
fn ignore_failure_preserves_original_git_exclude_bytes() {
    let home = tempfile::tempdir().unwrap();
    let root = home.path();
    git(root, &["init", "-q"]);
    git(
        root,
        &["remote", "add", "origin", "https://github.com/team/repo"],
    );
    let adapter = create_git_repo_adapter(IGitRepoOptions {
        home: Some(root.to_string_lossy().into()),
        ..Default::default()
    });
    let checkout = adapter
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    fs::write(root.join(".gitignore"), "!.env.keep\n").unwrap();
    let exclude = Path::new(&checkout.git_dir).join("info/exclude");
    let before = fs::read(&exclude).unwrap();
    assert!(adapter.ensure_ignored(&checkout, ".env.keep").is_err());
    assert_eq!(fs::read(exclude).unwrap(), before);
}

#[test]
fn invalid_utf8_exclude_bytes_are_preserved_when_appending() {
    let home = tempfile::tempdir().unwrap();
    let root = home.path();
    git(root, &["init", "-q"]);
    git(
        root,
        &["remote", "add", "origin", "https://github.com/team/repo"],
    );
    let adapter = create_git_repo_adapter(IGitRepoOptions {
        home: Some(root.to_string_lossy().into()),
        ..Default::default()
    });
    let checkout = adapter
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    let exclude = Path::new(&checkout.git_dir).join("info/exclude");
    fs::write(&exclude, b"# user\xff\n").unwrap();
    adapter.ensure_ignored(&checkout, ".env").unwrap();
    assert_eq!(fs::read(exclude).unwrap(), b"# user\xff\n\n/.env\n");
}
