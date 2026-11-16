use crate::sync::{
    local::{
        applied::{applied_files, has_applied_entry},
        conflicts::conflict_records,
        validation::rules::env_rules,
    },
    remote::{
        content::{entry_name, readable_entries},
        context::ISyncContext,
    },
};
use envden_core::errors::Result;
use std::collections::HashSet;

pub(in crate::sync::remote) fn blocked_stores(
    context: &ISyncContext<'_>,
    failed: &HashSet<String>,
) -> Result<HashSet<String>> {
    let mut blocked = failed.clone();
    blocked.extend(
        conflict_records(&context.adapters.home)?
            .into_iter()
            .map(|r| r.store),
    );
    let rules = env_rules(&context.adapters.home)?;
    for link in context.state["links"].as_array().into_iter().flatten() {
        if !envden_core::adapters::accepts_env_path(
            link["path"].as_str().unwrap_or_default(),
            Some(&rules),
        )? {
            blocked.insert(link["store"].as_str().unwrap_or_default().to_owned());
        }
    }
    let applied = applied_files(&context.adapters.home)?;
    for entry in readable_entries(context)? {
        if has_applied_entry(&context.adapters.home, &entry, Some(&applied))? {
            continue;
        }
        let name = entry_name(context, &entry)?;
        blocked.insert(
            crate::store::store_path(&context.adapters.home, &name.repo_id, &name.path)?
                .to_string_lossy()
                .into_owned(),
        );
    }
    Ok(blocked)
}
