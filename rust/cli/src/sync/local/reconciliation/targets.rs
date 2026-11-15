use crate::{
    links::{approval::repo_of, checkout::mode::supported_placement, file::mode_name},
    store::store_path,
    sync::{local::conflicts::IConflictTarget, remote::context::ISyncContext},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::IFileName;
use std::collections::HashSet;

pub fn targets(
    context: &ISyncContext<'_>,
    repos: &HashSet<String>,
    name: &IFileName,
) -> Result<Vec<IConflictTarget>> {
    let store = store_path(&context.adapters.home, &name.repo_id, &name.path)?
        .to_string_lossy()
        .into_owned();
    let mut targets = Vec::new();
    for link in context.state["links"].as_array().into_iter().flatten() {
        if link["localOnly"] == true
            || link["store"] != store
            || context
                .skipped_roots
                .contains(link["root"].as_str().unwrap_or_default())
        {
            continue;
        }
        targets
            .push(serde_json::from_value(link.clone()).map_err(|e| {
                EnvdenError::with_source(ErrorCode::InvalidData, "Invalid link", e)
            })?);
    }
    for approved in context.state["approved"].as_array().into_iter().flatten() {
        let root = approved["root"].as_str().unwrap_or_default();
        let repo = repo_of(
            &context.state,
            approved["repoId"].as_str().unwrap_or_default(),
        );
        if context.skipped_roots.contains(root) || !repos.contains(repo) || repo != name.repo_id {
            continue;
        }
        if context.state["links"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|l| l["root"] == root && l["path"] == name.path)
        {
            continue;
        }
        let placement = supported_placement(context.adapters, root, false)?;
        targets.push(IConflictTarget {
            root: root.into(),
            path: name.path.clone(),
            store: store.clone(),
            mode: mode_name(placement.mode()).into(),
            local_only: None,
        });
    }
    Ok(targets)
}
