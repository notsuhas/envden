use super::{
    conflicts::IConflictTarget, files::read_bytes, reconcile::IReconciled,
    reconciliation::file::reconcile_file,
};
use crate::{
    links::checkout::repo::checkout_repo, output::sanitize_terminal,
    sync::remote::context::ISyncContext,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::Value;
use std::{collections::HashSet, path::Path};

pub(super) fn reconcile_unpublished(
    context: &mut ISyncContext<'_>,
    repos: &HashSet<String>,
) -> Result<IReconciled> {
    let mut result = IReconciled {
        changed: 0,
        conflicts: 0,
        failed_stores: HashSet::new(),
    };
    let mut seen = HashSet::new();
    let links = context.state["links"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    for link in links {
        if !is_unpublished(context, repos, &link)? {
            continue;
        }
        let store = link["store"].as_str().unwrap_or_default();
        let outcome = (|| {
            if !seen.insert(store.to_owned()) {
                return Ok(0);
            }
            let targets = context.state["links"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|l| {
                    l["store"] == store
                        && l["localOnly"] != true
                        && !context
                            .skipped_roots
                            .contains(l["root"].as_str().unwrap_or_default())
                })
                .map(|l| {
                    serde_json::from_value::<IConflictTarget>(l.clone()).map_err(|e| {
                        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid link", e)
                    })
                })
                .collect::<Result<Vec<_>>>()?;
            if link["mode"] == "link" && read_bytes(Path::new(store))?.is_none() {
                if let Some(report) = &context.options.report {
                    report(&sanitize_terminal(&format!(
                        "{}: content was lost outside envden",
                        link["path"].as_str().unwrap_or_default()
                    )));
                }
                return Err(EnvdenError::new(
                    ErrorCode::NotFound,
                    "Unpublished env file content is missing",
                ));
            }
            reconcile_file(context, &targets, store, None, &HashSet::new())
                .map(|(_, conflicts)| conflicts)
        })();
        match outcome {
            Ok(conflicts) => result.conflicts += conflicts,
            Err(error) => {
                if error.code == ErrorCode::InvalidInput && error.message == "Cancelled" {
                    return Err(error);
                }
                result.failed_stores.insert(store.to_owned());
                result.conflicts += 1;
                if let Some(report) = &context.options.report {
                    report(&sanitize_terminal(&format!(
                        "Could not place unpublished env file: {}",
                        link["path"].as_str().unwrap_or_default()
                    )));
                }
            }
        }
    }
    Ok(result)
}

fn is_unpublished(
    context: &ISyncContext<'_>,
    repos: &HashSet<String>,
    link: &Value,
) -> Result<bool> {
    let root = link["root"].as_str().unwrap_or_default();
    let Some(repo) = checkout_repo(&context.state, root) else {
        return Ok(false);
    };
    if link["localOnly"] == true || context.skipped_roots.contains(root) || !repos.contains(repo) {
        return Ok(false);
    }
    let id = p::file_id(
        &context.checkpoint.id_key,
        repo,
        link["path"].as_str().unwrap_or_default(),
    )?;
    Ok(!context
        .checkpoint
        .files
        .entries
        .iter()
        .any(|e| e.file_id == id))
}
