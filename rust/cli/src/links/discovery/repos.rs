use super::folders::{project_folder, skipped_folder};
use envden_core::{
    adapters::{ICheckout, IRepoAdapter},
    errors::ErrorCode,
};
use std::{
    collections::{BTreeMap, HashSet, VecDeque},
    fs,
    path::{Path, PathBuf},
    thread,
};

pub struct IDiscoveryScope {
    pub roots: Vec<PathBuf>,
    pub excluded: Vec<PathBuf>,
    pub home: Option<PathBuf>,
}

pub struct IRepoSkip {
    pub path: String,
    pub reason: String,
    pub kind: &'static str,
}

pub fn identify(
    repo: &dyn IRepoAdapter,
    path: &str,
    report: &dyn Fn(IRepoSkip),
) -> Option<ICheckout> {
    match repo.checkout_at(path) {
        Ok(Some(checkout)) => Some(checkout),
        Ok(None) => {
            report(IRepoSkip {
                path: path.into(),
                reason: "Repository identity unavailable".into(),
                kind: "identity",
            });
            None
        }
        Err(error) => {
            report(IRepoSkip {
                path: path.into(),
                reason: error.message.into_owned(),
                kind: if error.code == ErrorCode::InvalidInput {
                    "remote"
                } else {
                    "identity"
                },
            });
            None
        }
    }
}

pub fn discover_repos(
    repo: &dyn IRepoAdapter,
    scope: &IDiscoveryScope,
    report: &(dyn Fn(IRepoSkip) + Sync),
    progress: &dyn Fn(usize),
) -> Vec<ICheckout> {
    let excludes: Vec<_> = scope.excluded.iter().map(|p| real_or_resolved(p)).collect();
    let home = scope.home.as_deref().map(real_or_resolved);
    let mut queue: VecDeque<_> = scope
        .roots
        .iter()
        .map(|p| (real_or_resolved(p), true))
        .collect();
    let mut visited = HashSet::new();
    let mut found = BTreeMap::new();
    while !queue.is_empty() {
        let batch: Vec<_> = (0..32).filter_map(|_| queue.pop_front()).collect();
        let folders = thread::scope(|scope| {
            let handles: Vec<_> = batch
                .into_iter()
                .map(|(path, root)| {
                    scope.spawn(move || {
                        let real = path.canonicalize().ok()?;
                        let entries: Vec<_> = fs::read_dir(&real)
                            .ok()?
                            .filter_map(std::result::Result::ok)
                            .collect();
                        Some((real, root, entries))
                    })
                })
                .collect();
            handles
                .into_iter()
                .filter_map(|h| h.join().ok().flatten())
                .collect::<Vec<_>>()
        });
        let folders: Vec<_> = folders
            .into_iter()
            .filter(|(path, _, _)| !excluded(path, &excludes) && visited.insert(path.clone()))
            .collect();
        let paths: Vec<_> = folders
            .iter()
            .filter(|(_, _, e)| e.iter().any(|e| e.file_name() == ".git"))
            .map(|(p, _, _)| p.clone())
            .collect();
        let mut collected = HashSet::new();
        for chunk in paths.chunks(8) {
            let results = thread::scope(|scope| {
                let handles: Vec<_> = chunk
                    .iter()
                    .map(|path| {
                        scope.spawn(move || identify(repo, &path.to_string_lossy(), report))
                    })
                    .collect();
                handles
                    .into_iter()
                    .filter_map(|h| h.join().ok().flatten())
                    .collect::<Vec<_>>()
            });
            let mut additional = Vec::new();
            for checkout in results {
                collected.insert(PathBuf::from(&checkout.root));
                found.insert(checkout.root.clone(), checkout.clone());
                progress(found.len());
                let worktrees = repo.worktrees(&checkout).unwrap_or_default();
                let submodules = repo.submodules(&checkout).unwrap_or_default();
                for worktree in worktrees {
                    if !found.contains_key(&worktree) && !excluded(Path::new(&worktree), &excludes)
                    {
                        additional.push(worktree);
                    }
                }
                for submodule in submodules {
                    let path = super::super::takeover::sibling::normalize(
                        &Path::new(&checkout.root).join(submodule),
                    );
                    if path != Path::new(&checkout.root)
                        && path.starts_with(&checkout.root)
                        && let Ok(real) = path.canonicalize()
                        && !excluded(&real, &excludes)
                        && !visited.contains(&real)
                    {
                        let checkout = fs::read_dir(&real).is_ok_and(|entries| {
                            entries
                                .filter_map(std::result::Result::ok)
                                .any(|entry| entry.file_name() == ".git")
                        });
                        if checkout {
                            queue.push_back((real, false));
                        } else {
                            visited.insert(real);
                        }
                    }
                }
            }
            for chunk in additional.chunks(8) {
                let worktrees = thread::scope(|scope| {
                    let handles: Vec<_> = chunk
                        .iter()
                        .map(|p| scope.spawn(move || identify(repo, p, report)))
                        .collect();
                    handles
                        .into_iter()
                        .filter_map(|h| h.join().ok().flatten())
                        .collect::<Vec<_>>()
                });
                for checkout in worktrees {
                    found.insert(checkout.root.clone(), checkout);
                    progress(found.len());
                }
            }
        }
        for (path, root, entries) in folders {
            if !root && collected.contains(&path) {
                continue;
            }
            let names: Vec<_> = entries
                .iter()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect();
            let project = project_folder(&names);
            for entry in entries {
                if entry
                    .file_type()
                    .is_ok_and(|k| k.is_dir() || k.is_symlink())
                    && !skipped_folder(
                        &entry.file_name().to_string_lossy(),
                        home.as_ref() == Some(&path),
                        project,
                    )
                {
                    queue.push_back((entry.path(), false));
                }
            }
        }
    }
    let mut results: Vec<_> = found.into_values().collect();
    results.sort_by(|a, b| crate::output::locale_compare(&a.root, &b.root));
    results
}

fn real_or_resolved(path: &Path) -> PathBuf {
    path.canonicalize()
        .unwrap_or_else(|_| std::path::absolute(path).unwrap_or_else(|_| path.to_owned()))
}

fn excluded(path: &Path, excludes: &[PathBuf]) -> bool {
    excludes.iter().any(|p| path.starts_with(p))
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
