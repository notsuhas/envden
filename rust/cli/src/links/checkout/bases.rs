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
        remove(&base_path(home, store, Some(root)))?;
        if !remaining.iter().any(|l| l["store"] == store) {
            remove(&base_path(home, store, None))?;
            remove(&suffix(&base_path(home, store, None), ".corrupt"))?;
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
