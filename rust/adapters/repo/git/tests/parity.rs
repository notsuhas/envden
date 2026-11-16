use envden_adapter_repo_git::{IGitRepoOptions, create_git_repo_adapter, normalize_repo_id};
use envden_core::adapters::IRepoAdapter;
use std::{fs, path::Path, process::Command};

fn git(root: &Path, args: &[&str]) {
    let result = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env_clear()
        .env("PATH", std::env::var_os("PATH").unwrap_or_default())
        .envs(
            ["SYSTEMROOT", "COMSPEC", "TEMP", "TMP"]
                .into_iter()
                .filter_map(|key| std::env::var_os(key).map(|value| (key, value))),
        )
        .env("HOME", root)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .unwrap();
    assert!(result.status.success(), "{:?}", result.stderr);
}

#[test]
fn exact_remote_rejections() {
    for remote in [
        "/tmp/repo",
        "https://host/../",
        "git@host:../repo",
        "https://host/a/%2e%2e/b.git",
        "file:///tmp/repo",
    ] {
        assert!(normalize_repo_id(remote, None).is_err());
    }
    for character in ["%1b", "%E2%80%AE"] {
        for remote in [
            format!("https://host/team/{character}repo"),
            format!("git@host:team/{character}repo"),
        ] {
            assert!(normalize_repo_id(&remote, None).is_err());
        }
    }
}

#[test]
fn identities_follow_global_and_local_url_rewrites() {
    let home = tempfile::tempdir().unwrap();
    let root = home.path().join("repo");
    fs::create_dir(&root).unwrap();
    git(&root, &["init", "-q"]);
    git(&root, &["remote", "add", "origin", "gh:Foo/Bar.git"]);
    git(&root, &["remote", "add", "upstream", "eq:team/repo"]);
    fs::write(home.path().join(".gitconfig"), "[url \"git@github.com:\"]\n insteadOf = gh:\n[url \"https://host.test/a=b/\"]\n insteadOf = eq:\n").unwrap();
    let adapter = create_git_repo_adapter(IGitRepoOptions {
        home: Some(home.path().to_string_lossy().into_owned()),
        resolve_ssh_host: Some(Box::new(|host| Ok(host.into()))),
        ..Default::default()
    });
    let checkout = adapter
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    assert_eq!(checkout.repo_id, "github.com/foo/bar");
    assert_eq!(
        checkout.upstream_repo_id.as_deref(),
        Some("host.test/a=b/team/repo")
    );
    git(
        &root,
        &["config", "url.https://gitlab.com/.insteadOf", "lab:"],
    );
    git(&root, &["remote", "set-url", "origin", "lab:Group/Repo"]);
    assert_eq!(
        adapter
            .checkout_at(root.to_str().unwrap())
            .unwrap()
            .unwrap()
            .repo_id,
        "gitlab.com/group/repo"
    );
}

#[test]
fn escaping_and_case_probed_tracking() {
    let home = tempfile::tempdir().unwrap();
    let root = home.path();
    git(root, &["init", "-q"]);
    git(
        root,
        &["remote", "add", "origin", "https://github.com/team/repo"],
    );
    let adapter = create_git_repo_adapter(IGitRepoOptions {
        home: Some(root.to_string_lossy().into_owned()),
        ..Default::default()
    });
    let checkout = adapter
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    assert!(adapter.ensure_ignored(&checkout, ".env\tlocal").is_err());
    for path in [".env.local name", ".env$(id)", ".env?[x]", ".env*"] {
        adapter.ensure_ignored(&checkout, path).unwrap();
        assert!(adapter.is_ignored(&checkout, path).unwrap());
    }
    for path in [".env.l", ".env.other"] {
        assert!(!adapter.is_ignored(&checkout, path).unwrap());
    }
    assert!(
        fs::read_to_string(root.join(".git/info/exclude"))
            .unwrap()
            .contains("/.env.local\\ name")
    );
    fs::write(root.join(".env"), "A=1").unwrap();
    git(root, &["add", ".env"]);
    let insensitive = adapter
        .case_insensitive(root.to_str().unwrap(), false)
        .unwrap();
    assert!(
        !adapter
            .is_ignored(&checkout, if insensitive { ".ENV" } else { ".env" })
            .unwrap()
    );
}

#[test]
fn embedded_bare_repository_cannot_choose_identity() {
    let home = tempfile::tempdir().unwrap();
    let root = home.path();
    git(root, &["init", "-q"]);
    git(
        root,
        &["remote", "add", "origin", "https://github.com/team/repo"],
    );
    let bare = root.join("embedded");
    git(root, &["init", "--bare", bare.to_str().unwrap()]);
    git(&bare, &["config", "core.worktree", root.to_str().unwrap()]);
    git(&bare, &["config", "core.bare", "false"]);
    git(
        &bare,
        &["remote", "add", "origin", "https://evil.test/owned"],
    );
    let adapter = create_git_repo_adapter(IGitRepoOptions {
        home: Some(root.to_string_lossy().into_owned()),
        ..Default::default()
    });
    assert!(
        adapter
            .checkout_at(bare.to_str().unwrap())
            .unwrap()
            .is_none()
    );
}
