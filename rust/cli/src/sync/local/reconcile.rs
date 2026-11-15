use super::{
    applied::{applied_files, save_applied_files},
    conflicts::IConflictTarget,
    reconciliation::{file::reconcile_file, targets::targets},
};
use crate::{
    links::checkout::repo::checkout_repo,
    store::store_path,
    sync::remote::{content::entry_name, content::readable_entries, context::ISyncContext},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::collections::HashSet;

pub struct IReconciled {
    pub changed: usize,
    pub conflicts: usize,
    pub failed_stores: HashSet<String>,
}

pub fn reconcile(
    context: &mut ISyncContext<'_>,
    repos: &HashSet<String>,
    repairs: &HashSet<String>,
) -> Result<IReconciled> {
    let mut result = IReconciled {
        changed: 0,
        conflicts: 0,
        failed_stores: HashSet::new(),
    };
    let rules = super::validation::rules::env_rules(&context.adapters.home)?;
    let mut applied = applied_files(&context.adapters.home)?;
    let mut work = Vec::new();
    let mut seen = HashSet::new();
    for link in context.state["links"].as_array().into_iter().flatten() {
        let Some(repo) = checkout_repo(&context.state, link["root"].as_str().unwrap_or_default())
        else {
            continue;
        };
        if link["localOnly"] == true || !repos.contains(repo) {
            continue;
        }
        let id = p::file_id(
            &context.checkpoint.id_key,
            repo,
            link["path"].as_str().unwrap_or_default(),
        )?;
        if context
            .checkpoint
            .files
            .entries
            .iter()
            .any(|e| e.file_id == id)
        {
            continue;
        }
        let store = link["store"].as_str().unwrap_or_default().to_owned();
        if !seen.insert(store.clone()) {
            continue;
        }
        let targets = context.state["links"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|l| l["store"] == store && l["localOnly"] != true)
            .map(|l| {
                serde_json::from_value::<IConflictTarget>(l.clone()).map_err(|e| {
                    EnvdenError::with_source(ErrorCode::InvalidData, "Invalid link", e)
                })
            })
            .collect::<Result<Vec<_>>>()?;
        work.push((store, targets, None));
    }
    let collisions = super::validation::entries::collision_entries(context, repos)?;
    for entry in readable_entries(context)? {
        let name = entry_name(context, &entry)?;
        if !repos.contains(&name.repo_id) {
            continue;
        }
        if !envden_core::adapters::accepts_env_path(&name.path, Some(&rules)) {
            if let Some(report) = &context.options.report {
                report(&format!("Skipped env file: {}", name.path));
            }
            continue;
        }
        let store = store_path(&context.adapters.home, &name.repo_id, &name.path)?
            .to_string_lossy()
            .into_owned();
        if collisions.contains(&entry.file_id) {
            result.failed_stores.insert(store);
            result.conflicts += 1;
            if let Some(report) = &context.options.report {
                report(&crate::output::sanitize_terminal(&format!(
                    "Could not place env file: {}",
                    name.path
                )));
            }
            continue;
        }
        work.push((store, targets(context, repos, &name)?, Some(entry)));
    }
    for (store, targets, entry) in work {
        match reconcile_file(context, &targets, &store, entry.as_ref(), repairs) {
            Ok((changed, conflicts)) => {
                if let Some(entry) = entry {
                    result.changed += changed;
                    if conflicts == 0 {
                        applied.insert(
                            p::base32(&entry.file_id),
                            crate::client::text(&p::encode(&entry)?).into(),
                        );
                    }
                }
                result.conflicts += conflicts;
            }
            Err(error) => {
                if let Some(report) = &context.options.report {
                    report(&format!(
                        "Could not place env file ({}): {}",
                        error.code.as_str(),
                        targets.first().map_or("", |t| &t.path)
                    ));
                }
                result.failed_stores.insert(store);
                result.conflicts += 1;
            }
        }
        save_applied_files(
            &context.adapters.home,
            applied.clone(),
            (context.options.now)(),
        )?;
    }
    Ok(result)
}
