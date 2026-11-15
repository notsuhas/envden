use crate::paths::{TRootPlacement, absolute, place_in_root};
use std::{
    path::{Path, PathBuf},
    sync::RwLock,
};
static ROOTS: RwLock<Vec<PathBuf>> = RwLock::new(Vec::new());
pub fn set_untrusted_roots(roots: &[String]) {
    let mut result = Vec::new();
    for root in roots {
        let p = absolute(root);
        if let Ok(canonical) = p.canonicalize()
            && !result.contains(&canonical)
        {
            result.push(canonical);
        }
        if !result.contains(&p) {
            result.push(p);
        }
    }
    *ROOTS.write().unwrap() = result;
}
pub fn inside_untrusted_root(path: impl AsRef<Path>) -> bool {
    ROOTS
        .read()
        .unwrap()
        .iter()
        .any(|root| place_in_root(root, &path) != TRootPlacement::Outside)
}
