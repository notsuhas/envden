use super::{identify::identify, parallel::parallel_map, repos::IRepoSkip};
use envden_core::adapters::{ICheckout, IRepoAdapter};
use envden_core::filesystem::ICanonicalPath;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

pub(super) struct IWalk<'a> {
    pub repo: &'a dyn IRepoAdapter,
    pub excludes: Vec<PathBuf>,
    pub visited: HashSet<PathBuf>,
    pub found: Vec<ICheckout>,
    pub report: &'a (dyn Fn(IRepoSkip) + Sync),
    pub progress: &'a dyn Fn(usize),
}

impl IWalk<'_> {
    pub fn excluded(&self, path: &Path) -> bool {
        self.excludes
            .iter()
            .any(|excluded| path.starts_with(excluded))
    }

    pub fn unseen(&mut self, path: &Path) -> bool {
        !self.excluded(path) && self.visited.insert(path.to_owned())
    }

    fn add(&mut self, checkout: ICheckout) {
        if let Some(previous) = self
            .found
            .iter_mut()
            .find(|item| item.root == checkout.root)
        {
            *previous = checkout;
        } else {
            self.found.push(checkout);
        }
        (self.progress)(self.found.len());
    }

    pub fn collect(&mut self, checkout: ICheckout) {
        self.add(checkout.clone());
        let (worktrees, submodules) = std::thread::scope(|scope| {
            let worktrees = scope.spawn(|| self.repo.worktrees(&checkout).unwrap_or_default());
            let submodules = scope.spawn(|| self.repo.submodules(&checkout).unwrap_or_default());
            (
                worktrees.join().unwrap_or_default(),
                submodules.join().unwrap_or_default(),
            )
        });
        let worktrees: Vec<_> = worktrees
            .into_iter()
            .filter(|path| {
                !self.found.iter().any(|item| item.root == *path) && !self.excluded(Path::new(path))
            })
            .collect();
        for worktree in parallel_map(&worktrees, 8, |path| identify(self.repo, path, self.report)) {
            self.add(worktree);
        }
        let paths: Vec<_> = submodules
            .into_iter()
            .map(|path| {
                crate::links::takeover::sibling::normalize(&Path::new(&checkout.root).join(path))
            })
            .filter(|path| path != Path::new(&checkout.root) && path.starts_with(&checkout.root))
            .collect();
        let real = parallel_map(&paths, 32, |path| path.canonical_path().ok());
        let unseen: Vec<_> = real.into_iter().filter(|path| self.unseen(path)).collect();
        let checkouts = parallel_map(&unseen, 32, |path| {
            fs::read_dir(path)
                .ok()?
                .filter_map(std::result::Result::ok)
                .any(|entry| entry.file_name() == ".git")
                .then(|| path.clone())
        });
        for next in parallel_map(&checkouts, 8, |path| {
            identify(self.repo, &path.to_string_lossy(), self.report)
        }) {
            self.collect(next);
        }
    }
}
