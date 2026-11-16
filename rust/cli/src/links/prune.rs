use crate::{
    state::{lock::with_state_lock, repository::save_state},
    sync::local::conflicts::remove_conflict_targets,
};
use envden_core::{errors::Result, filesystem::path_identity};
use serde_json::Value;
use std::{fs, path::Path};

pub fn prune_missing_checkouts(
    home: &Path,
    state: &mut Value,
    notice: &dyn Fn(&str),
    now: u64,
) -> Result<()> {
    with_state_lock(home, now, || {
        let approved = state["approved"].as_array().cloned().unwrap_or_default();
        for approval in approved {
            let root = approval["root"].as_str().unwrap_or_default();
            match fs::symlink_metadata(root) {
                Ok(_) => continue,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(crate::state::files::failure(e)),
            }
            let Some(parent) = Path::new(root).parent() else {
                continue;
            };
            let Ok(parent) = path_identity(parent) else {
                continue;
            };
            if approval["rootDevice"]
                .as_u64()
                .is_some_and(|d| d != parent.device)
            {
                continue;
            }
            if let Some(a) = state["approved"].as_array_mut() {
                a.retain(|a| a["root"] != root);
            }
            let links = state["links"].as_array().cloned().unwrap_or_default();
            let removed: Vec<_> = links
                .iter()
                .filter(|l| l["root"] == root)
                .cloned()
                .collect();
            let remaining: Vec<_> = links
                .iter()
                .filter(|l| l["root"] != root)
                .cloned()
                .collect();
            super::checkout::bases::remove_checkout_bases(home, &removed, &remaining, now)?;
            remove_conflict_targets(home, root, now)?;
            state["links"] = remaining.into();
            notice(&format!("Missing checkout removed: {root}"));
        }
        save_state(home, state, now)
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn parent_existence_uses_lstat_even_for_a_dangling_symlink() {
        let temp = tempfile::tempdir().unwrap();
        let parent = temp.path().join("unavailable-parent");
        std::os::unix::fs::symlink(temp.path().join("missing"), &parent).unwrap();
        let checkout = envden_core::adapters::ICheckout {
            root: parent.join("checkout").to_string_lossy().into_owned(),
            git_dir: "/git".into(),
            repo_id: "host/repo".into(),
            ..Default::default()
        };
        let mut state = crate::state::empty_state("test");
        state["approved"] = serde_json::json!([crate::links::approval::checkout_value(&checkout)]);
        prune_missing_checkouts(&temp.path().join("home"), &mut state, &|_| {}, 42).unwrap();
        assert!(state["approved"].as_array().unwrap().is_empty());
    }
}
