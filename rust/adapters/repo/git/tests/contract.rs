use envden_adapter_repo_git::{IGitRepoOptions, create_git_repo_adapter};
use envden_testing::repo::{IRepoFixture, repo_contract};
use std::{path::Path, process::Command};
fn git(root: &Path, args: &[&str]) {
    assert!(
        Command::new("git")
            .arg("-C")
            .arg(root)
            .args(args)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .status()
            .unwrap()
            .success()
    );
}
#[test]
fn contract() {
    repo_contract(|dir| {
        let home = Path::new(dir).join("home");
        let root = Path::new(dir).join("repo");
        let outside = Path::new(dir).join("outside");
        for p in [&home, &root, &outside] {
            std::fs::create_dir(p).unwrap();
        }
        git(&root, &["init", "-q"]);
        git(
            &root,
            &[
                "remote",
                "add",
                "origin",
                "https://github.com/owner/repo.git",
            ],
        );
        IRepoFixture {
            repo: Box::new(create_git_repo_adapter(IGitRepoOptions {
                resolve_ssh_host: Some(Box::new(|s| Ok(s.into()))),
                home: Some(home.to_string_lossy().into_owned()),
                ..Default::default()
            })),
            root: root.to_string_lossy().into_owned(),
            outside: outside.to_string_lossy().into_owned(),
        }
    });
}
