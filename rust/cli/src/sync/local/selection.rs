use crate::{
    adapters::IAdapters,
    links::{
        approval::{checkout_approval, repo_of},
        prune::prune_missing_checkouts,
    },
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;
use std::{collections::HashSet, path::Path};

pub fn selected_repos(
    adapters: &IAdapters,
    state: &mut Value,
    cwd: &Path,
    all: bool,
    skipped_roots: &mut HashSet<String>,
    report: &dyn Fn(&str),
) -> Result<HashSet<String>> {
    prune_missing_checkouts(&adapters.home, state, report, &adapters.now)?;
    let mut repos = HashSet::new();
    for approved in state["approved"].as_array().into_iter().flatten() {
        let root = approved["root"].as_str().unwrap_or_default();
        if !all && !cwd.starts_with(root) {
            continue;
        }
        let checkout = adapters.repo.checkout_at(root)?;
        let approval = checkout
            .as_ref()
            .map_or("ask", |checkout| checkout_approval(state, checkout));
        if approval == "ask" {
            skipped_roots.insert(root.into());
            report("Skipped checkout requiring approval; run envden track");
            continue;
        }
        if approval == "changed" {
            return Err(EnvdenError::new(
                ErrorCode::Conflict,
                "Approved checkout changed; use envden alias",
            ));
        }
        repos.insert(repo_of(state, approved["repoId"].as_str().unwrap_or_default()).to_owned());
    }
    if !all && repos.is_empty() {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Run in an approved checkout or use --all",
        ));
    }
    Ok(repos)
}
