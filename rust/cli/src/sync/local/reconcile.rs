use super::{
    applied::{applied_files, save_applied_files},
    reconciliation::{file::reconcile_file_with_choice, targets::targets},
};
use crate::{
    output::sanitize_terminal,
    store::store_path,
    sync::remote::{
        content::{entry_name, readable_entries},
        context::ISyncContext,
    },
};
use envden_core::errors::{ErrorCode, Result};
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
    reconcile_with_choice(context, repos, repairs, None)
}

pub fn reconcile_with_choice(
    context: &mut ISyncContext<'_>,
    repos: &HashSet<String>,
    repairs: &HashSet<String>,
    choose: Option<crate::sync::remote::context::TChoose>,
) -> Result<IReconciled> {
    let mut applied = applied_files(&context.adapters.home)?;
    let rules = super::validation::rules::env_rules(&context.adapters.home)?;
    let mut result = super::unpublished::reconcile_unpublished(context, repos)?;
    let collisions = super::validation::entries::collision_entries(context, repos)?;
    let mut selected = Vec::new();
    for entry in readable_entries(context)? {
        let name = entry_name(context, &entry)?;
        if !repos.contains(&name.repo_id) {
            continue;
        }
        if !envden_core::adapters::accepts_env_path(&name.path, Some(&rules)) {
            report(context, &format!("Skipped env file: {}", name.path));
        } else {
            selected.push(entry);
        }
    }
    for entry in selected {
        let before_conflicts = result.conflicts;
        let name = entry_name(context, &entry)?;
        let store = store_path(&context.adapters.home, &name.repo_id, &name.path)?
            .to_string_lossy()
            .into_owned();
        if collisions.contains(&entry.file_id) {
            result.failed_stores.insert(store);
            result.conflicts += 1;
            report(context, &format!("Could not place env file: {}", name.path));
            continue;
        }
        let outcome = (|| {
            let targets = targets(context, repos, &name)?;
            if targets.is_empty() {
                return Ok(None);
            }
            reconcile_file_with_choice(
                context,
                &targets,
                &store,
                Some(&entry),
                repairs,
                choose.clone(),
            )
            .map(Some)
        })();
        match outcome {
            Ok(None) => continue,
            Ok(Some((changed, conflicts))) => {
                result.changed += changed;
                result.conflicts += conflicts;
            }
            Err(error) => {
                if error.code == ErrorCode::InvalidInput && error.message == "Cancelled" {
                    return Err(error);
                }
                report(
                    context,
                    &format!(
                        "Could not place env file ({}): {}",
                        error.code.as_str(),
                        name.path
                    ),
                );
                result.failed_stores.insert(store);
                result.conflicts += 1;
            }
        }
        if result.conflicts == before_conflicts {
            applied.insert(
                p::base32(&entry.file_id),
                crate::client::text(&p::encode(&entry)?).into(),
            );
        }
        save_applied_files(
            &context.adapters.home,
            applied.clone(),
            (context.options.now)(),
        )?;
    }
    save_applied_files(&context.adapters.home, applied, (context.options.now)())?;
    Ok(result)
}

fn report(context: &ISyncContext<'_>, message: &str) {
    if let Some(report) = &context.options.report {
        report(&sanitize_terminal(message));
    }
}
