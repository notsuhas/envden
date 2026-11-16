use crate::{checkout::worktrees_with, exec, remote::resolve_host_with};
use envden_core::errors::{EnvdenError, ErrorCode};
use std::{fs, path::Path, process::Command};

pub(super) fn git(root: &Path, args: &[&str]) {
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
fn global_execution_settings_are_ignored_but_safe_directories_survive() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("repo");
    let home = temp.path().join("home");
    fs::create_dir(&root).unwrap();
    fs::create_dir(&home).unwrap();
    git(&root, &["init", "-q"]);
    fs::write(
        home.join(".gitconfig"),
        format!(
            "[envden]\n test = global\n[safe]\n directory = {:?}\n",
            root.to_str().unwrap()
        ),
    )
    .unwrap();
    let run = |args: &[&str]| exec::git(root.to_str().unwrap(), args, None, false, home.to_str());
    assert!(run(&["config", "--get", "envden.test"]).is_err());
    assert_eq!(
        run(&["config", "--get-all", "safe.directory"])
            .unwrap()
            .trim(),
        root.to_str().unwrap()
    );
}

#[test]
fn ssh_only_executes_safe_option_terminated_hosts() {
    for host in ["-oProxyCommand=evil", "foo bar", "foo\nbar", "$(id)", ""] {
        assert_eq!(
            resolve_host_with(host, |_, _| panic!("executed unsafe host"))
                .unwrap_err()
                .code,
            ErrorCode::InvalidInput
        );
    }
    assert_eq!(
        resolve_host_with("work-git", |command, args| {
            assert_eq!(command, "ssh");
            assert_eq!(args, ["-G", "--", "work-git"]);
            Ok("user git\nhostname github.com  \nport 22\n".into())
        })
        .unwrap(),
        "github.com"
    );
    assert_eq!(
        resolve_host_with("work", |_, _| Ok("user git\n".into()))
            .unwrap_err()
            .code,
        ErrorCode::Internal
    );
    for separator in [" ", "\t", "  "] {
        assert_eq!(
            resolve_host_with("work", |_, _| Ok(format!(
                "user git\nhostname{separator}github.com\n"
            )))
            .unwrap(),
            "github.com"
        );
    }
    let error = resolve_host_with("work", |_, _| {
        Err(EnvdenError::new(ErrorCode::Conflict, "ssh failed"))
    })
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::Conflict);
    assert_eq!(error.message, "ssh failed");
}

#[test]
fn legacy_git_worktree_listing_falls_back_and_excludes_gone_worktrees() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    git(&root, &["init", "-q"]);
    fs::write(root.join("README"), "test").unwrap();
    git(&root, &["add", "README"]);
    git(
        &root,
        &[
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.com",
            "commit",
            "-qm",
            "initial",
        ],
    );
    for name in ["kept", "gone"] {
        git(
            &root,
            &[
                "worktree",
                "add",
                "-qb",
                name,
                root.join(name).to_str().unwrap(),
            ],
        );
    }
    fs::remove_dir_all(root.join("gone")).unwrap();
    let run = |args: &[&str]| exec::git(root.to_str().unwrap(), args, None, false, root.to_str());
    let listed = worktrees_with(run).unwrap();
    assert!(
        listed
            .iter()
            .any(|path| fs::canonicalize(path).unwrap() == root.join("kept"))
    );
    assert!(!listed.iter().any(|p| p.ends_with("gone")));
    let listed = worktrees_with(|args| {
        if args.contains(&"-z") {
            Err(EnvdenError::new(ErrorCode::Internal, "unknown switch `z'"))
        } else {
            run(args)
        }
    })
    .unwrap();
    assert_eq!(
        listed
            .iter()
            .map(|path| fs::canonicalize(path).unwrap())
            .collect::<Vec<_>>(),
        [root.clone(), root.join("kept")]
    );
}

mod remaining;
