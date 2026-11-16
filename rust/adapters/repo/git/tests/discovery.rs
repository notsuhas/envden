use envden_adapter_repo_git::{IGitRepoOptions, create_git_repo_adapter};
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
fn discovery_skips_submodules_and_nested_clones_and_lists_user_links() {
    use envden_core::adapters::{IEnvFileRules, accepts_env_path};
    let home = tempfile::tempdir().unwrap();
    let root = home.path();
    git(root, &["init", "-q"]);
    git(
        root,
        &["remote", "add", "origin", "https://github.com/team/repo"],
    );
    fs::write(root.join(".gitignore"), ".env*\n").unwrap();
    fs::create_dir(root.join("nested")).unwrap();
    fs::write(root.join("nested/.env"), "KEY=child\n").unwrap();
    fs::create_dir_all(root.join("libs/clone/.git")).unwrap();
    fs::write(root.join("libs/clone/.env"), "KEY=vendored\n").unwrap();
    git(
        root,
        &[
            "update-index",
            "--add",
            "--cacheinfo",
            "160000,1111111111111111111111111111111111111111,nested",
        ],
    );
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(root.join("missing"), root.join(".env.dangling")).unwrap();
        std::os::unix::fs::symlink("nested/.env", root.join(".env.shared")).unwrap();
    }
    let adapter = create_git_repo_adapter(IGitRepoOptions {
        home: Some(root.to_string_lossy().into_owned()),
        ..Default::default()
    });
    let checkout = adapter
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    let files = adapter.env_files(&checkout, None).unwrap();
    #[cfg(unix)]
    assert_eq!(files, [".env.dangling", ".env.shared"]);
    #[cfg(windows)]
    assert!(files.is_empty());
    let rules = IEnvFileRules {
        include: Some(vec!["*".into()]),
        extra_skipped: Some(vec!["generated".into()]),
        ..Default::default()
    };
    for path in [
        ".envrc",
        ".ENVRC",
        "node_modules/.env",
        "Node_Modules/.env",
        "generated/.env",
    ] {
        assert!(!accepts_env_path(path, Some(&rules)));
    }
    assert!(accepts_env_path("apps/.env.local", None));
}
