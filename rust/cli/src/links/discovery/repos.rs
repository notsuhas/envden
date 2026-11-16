use super::{
    collect::IWalk,
    folders::{project_folder, skipped_folder},
    identify::identify,
    parallel::parallel_map,
};
use envden_core::adapters::{ICheckout, IRepoAdapter};
use std::{
    collections::{HashSet, VecDeque},
    fs,
    path::{Path, PathBuf},
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

pub fn discover_repos(
    repo: &dyn IRepoAdapter,
    scope: &IDiscoveryScope,
    report: &(dyn Fn(IRepoSkip) + Sync),
    progress: &dyn Fn(usize),
) -> Vec<ICheckout> {
    let excludes = scope
        .excluded
        .iter()
        .map(|path| real_or_resolved(path))
        .collect();
    let home = scope.home.as_deref().map(real_or_resolved);
    let mut walk = IWalk {
        repo,
        excludes,
        visited: HashSet::new(),
        found: Vec::new(),
        report,
        progress,
    };
    let mut queue: VecDeque<_> = scope
        .roots
        .iter()
        .map(|path| (resolved(path), true))
        .collect();
    while !queue.is_empty() {
        let batch: Vec<_> = (0..32).filter_map(|_| queue.pop_front()).collect();
        let real = parallel_map(&batch, 32, |(path, root)| {
            Some((path.canonicalize().ok()?, *root))
        });
        let unseen: Vec<_> = real
            .into_iter()
            .filter(|(path, _)| walk.unseen(path))
            .collect();
        let folders = parallel_map(&unseen, 32, |(path, root)| {
            let entries: Vec<_> = fs::read_dir(path)
                .ok()?
                .filter_map(std::result::Result::ok)
                .collect();
            Some((path.clone(), *root, entries))
        });
        let paths: Vec<_> = folders
            .iter()
            .filter(|(_, _, entries)| entries.iter().any(|entry| entry.file_name() == ".git"))
            .map(|(path, _, _)| path.clone())
            .collect();
        let mut collected = HashSet::new();
        for checkout in parallel_map(&paths, 8, |path| {
            identify(repo, &path.to_string_lossy(), report)
        }) {
            collected.insert(PathBuf::from(&checkout.root));
            walk.collect(checkout);
        }
        for (path, root, entries) in folders {
            if !root && collected.contains(&path) {
                continue;
            }
            let names: Vec<_> = entries
                .iter()
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .collect();
            let project = project_folder(&names);
            for entry in entries {
                if entry
                    .file_type()
                    .is_ok_and(|kind| kind.is_dir() || kind.is_symlink())
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
    walk.found
        .sort_by(|a, b| crate::output::locale_compare(&a.root, &b.root));
    walk.found
}

fn resolved(path: &Path) -> PathBuf {
    crate::links::takeover::sibling::normalize(
        &std::path::absolute(path).unwrap_or_else(|_| path.to_owned()),
    )
}

fn real_or_resolved(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| resolved(path))
}

#[cfg(test)]
mod tests;
