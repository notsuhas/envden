use crate::{adapter::GitRepoAdapter, exec, remote};
use envden_core::filesystem::ICanonicalPath;
use envden_core::filesystem::path_identity;
use envden_core::{
    adapters::ICheckout,
    errors::{EnvdenError, ErrorCode, Result},
};
use path_clean::PathClean;
use std::{fs, path::Path};

fn id(adapter: &GitRepoAdapter, root: &str, name: &str) -> Result<String> {
    let remote = exec::git(
        root,
        &["remote", "get-url", name],
        None,
        true,
        adapter.home.as_deref(),
    )?;
    let remote = remote.trim();
    let (host, _, ssh) = remote::parts(remote)?;
    let hostname = if ssh {
        Some((adapter.resolve_host)(&host)?)
    } else {
        None
    };
    remote::normalize_repo_id(remote, hostname.as_deref())
}

pub(crate) fn checkout(adapter: &GitRepoAdapter, path: &str) -> Result<Option<ICheckout>> {
    let stat = fs::symlink_metadata(path).map_err(exec::failure)?;
    let dir = if stat.is_dir() {
        Path::new(path)
    } else {
        Path::new(path).parent().unwrap()
    };
    let root = match adapter.git(
        &dir.to_string_lossy(),
        &["rev-parse", "--show-toplevel"],
        None,
    ) {
        Ok(s) => s.trim_end().to_owned(),
        Err(e) if exec::exit(&e).is_some() => return Ok(None),
        Err(e) => return Err(e),
    };
    let remotes = adapter.git(&root, &["remote"], None)?;
    let remotes: Vec<_> = remotes.trim().lines().filter(|s| !s.is_empty()).collect();
    let name = if remotes.contains(&"origin") {
        "origin"
    } else if remotes.len() == 1 {
        remotes[0]
    } else {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Choose a git remote for this checkout",
        ));
    };
    let repo_id = id(adapter, &root, name)?;
    let common = adapter.git(&root, &["rev-parse", "--git-common-dir"], None)?;
    let git_dir = Path::new(&root)
        .join(common.trim_end())
        .canonical_path()
        .map_err(exec::failure)?;
    let root = Path::new(&root).canonical_path().map_err(exec::failure)?;
    let directory = path_identity(&git_dir).map_err(exec::failure)?;
    let root_stat = path_identity(&root).map_err(exec::failure)?;
    let root = root.to_string_lossy().into_owned();
    let git_dir = git_dir.to_string_lossy().into_owned();
    Ok(Some(ICheckout {
        identity: Some(format!(
            "{}:{}:{}:{}:{}",
            directory.device as f64,
            directory.inode as f64,
            directory.birth_ms,
            root_stat.inode as f64,
            root_stat.birth_ms
        )),
        root_device: Some(root_stat.device),
        upstream_repo_id: if remotes.contains(&"upstream") {
            Some(id(adapter, &root, "upstream")?)
        } else {
            None
        },
        registered_worktree: Some(registered(adapter, &root, &git_dir)),
        root,
        repo_id,
        git_dir,
    }))
}

fn registered(adapter: &GitRepoAdapter, root: &str, common: &str) -> bool {
    let check = || -> Option<bool> {
        let dot = Path::new(root).join(".git");
        let info = dot.symlink_metadata().ok()?;
        if !info.is_file() || info.is_symlink() {
            return Some(false);
        }
        let private = Path::new(root)
            .join(
                adapter
                    .git(root, &["rev-parse", "--git-dir"], None)
                    .ok()?
                    .trim_end(),
            )
            .canonical_path()
            .ok()?;
        let registrations = Path::new(common).join("worktrees");
        let info = registrations.symlink_metadata().ok()?;
        if !info.is_dir() || info.is_symlink() {
            return Some(false);
        }
        let registrations = registrations.canonical_path().ok()?;
        let name = private.strip_prefix(registrations).ok()?;
        if name.components().count() != 1 {
            return Some(false);
        }
        let backlink = private.join("gitdir");
        let info = backlink.symlink_metadata().ok()?;
        if !info.is_file() || info.is_symlink() {
            return Some(false);
        }
        Some(
            private
                .join(fs::read_to_string(backlink).ok()?.trim_end())
                .canonical_path()
                .ok()?
                == dot.canonical_path().ok()?,
        )
    };
    check().unwrap_or(false)
}

pub(crate) fn worktrees(adapter: &GitRepoAdapter, checkout: &ICheckout) -> Result<Vec<String>> {
    let (output, sep) = match adapter.git(
        &checkout.root,
        &["worktree", "list", "--porcelain", "-z"],
        None,
    ) {
        Ok(s) => (s, "\0"),
        Err(_) => (
            adapter.git(&checkout.root, &["worktree", "list", "--porcelain"], None)?,
            "\n",
        ),
    };
    Ok(output
        .split(&sep.repeat(2))
        .map(|r| r.split(sep).collect::<Vec<_>>())
        .filter(|f| !f.iter().any(|s| *s == "bare" || s.starts_with("prunable")))
        .flat_map(|f| {
            f.into_iter().filter_map(|s| {
                s.strip_prefix("worktree ")
                    .map(|p| Path::new(p).clean().to_string_lossy().into_owned())
            })
        })
        .collect())
}

pub(crate) fn submodules(adapter: &GitRepoAdapter, checkout: &ICheckout) -> Result<Vec<String>> {
    let path = Path::new(&checkout.root).join(".gitmodules");
    let output = match adapter.git(
        &checkout.root,
        &[
            "config",
            "--file",
            &path.to_string_lossy(),
            "--no-includes",
            "-z",
            "--get-regexp",
            "^submodule\\..*\\.path$",
        ],
        None,
    ) {
        Ok(s) => s,
        Err(e) if exec::exit(&e) == Some(1) => String::new(),
        Err(e) => return Err(e),
    };
    Ok(output
        .split('\0')
        .filter(|s| !s.is_empty())
        .map(|s| s.split_once('\n').map(|(_, v)| v).unwrap_or(s).to_owned())
        .collect())
}
