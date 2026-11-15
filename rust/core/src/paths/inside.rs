use path_clean::PathClean;
use std::path::{Path, PathBuf};
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TRootPlacement {
    Root,
    Inside,
    Outside,
}
pub fn absolute(path: impl AsRef<Path>) -> PathBuf {
    let p = path.as_ref();
    if p.is_absolute() {
        p.clean()
    } else {
        std::env::current_dir().unwrap_or_default().join(p).clean()
    }
}
pub fn place_in_root(root: impl AsRef<Path>, target: impl AsRef<Path>) -> TRootPlacement {
    if cfg!(windows) {
        return super::place_in_root_windows(
            &absolute(root).to_string_lossy(),
            &absolute(target).to_string_lossy(),
        );
    }
    let root = absolute(root);
    let target = absolute(target);
    if root == target {
        TRootPlacement::Root
    } else if target.starts_with(root) {
        TRootPlacement::Inside
    } else {
        TRootPlacement::Outside
    }
}
