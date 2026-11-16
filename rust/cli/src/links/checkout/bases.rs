use crate::sync::local::{
    files::base_path,
    reconciliation::operation::{deletion::suffix, record::preserve_pending_ancestor},
};
use envden_core::errors::Result;
use serde_json::Value;
use std::{fs, path::Path};

pub fn remove_checkout_bases(
    home: &Path,
    removed: &[Value],
    remaining: &[Value],
    now: u64,
) -> Result<()> {
    for link in removed {
        let store = link["store"].as_str().unwrap_or_default();
        let root = link["root"].as_str().unwrap_or_default();
        preserve_pending_ancestor(home, store, now)?;
        remove(&suffix(&base_path(home, store, None), ".pending"))?;
        let unshared = !remaining.iter().any(|l| l["store"] == store);
        if unshared {
            remove(&suffix(&base_path(home, store, None), ".corrupt"))?;
        }
        remove(&base_path(home, store, Some(root)))?;
        if unshared {
            remove(&base_path(home, store, None))?;
        }
    }
    Ok(())
}

fn remove(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(crate::state::files::failure(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_corrupt_marker_before_checkout_and_shared_bases() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path();
        let store = home.join("store/env").to_string_lossy().into_owned();
        let shared = base_path(home, &store, None);
        let checkout = base_path(home, &store, Some("/repo"));
        fs::create_dir_all(shared.parent().unwrap()).unwrap();
        fs::create_dir_all(checkout.parent().unwrap()).unwrap();
        fs::write(&shared, b"A=1").unwrap();
        fs::write(&checkout, b"A=1").unwrap();
        fs::create_dir(suffix(&shared, ".corrupt")).unwrap();
        let removed = [serde_json::json!({"root":"/repo", "store":store})];
        assert!(remove_checkout_bases(home, &removed, &[], 42).is_err());
        assert!(checkout.exists());
        assert!(shared.exists());
    }
}
