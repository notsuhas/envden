use super::{alias::derive_alias, approval::repo_of};
use envden_core::{adapters::ICheckout, errors::Result};
use serde_json::Value;
use std::collections::HashSet;

pub fn should_ask_alias(state: &Value, checkout: &ICheckout, repos: &HashSet<String>) -> bool {
    let Some(target) = checkout
        .upstream_repo_id
        .as_deref()
        .filter(|s| !s.is_empty())
    else {
        return false;
    };
    let roots: HashSet<_> = state["approved"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|a| a["repoId"] == checkout.repo_id)
        .filter_map(|a| a["root"].as_str())
        .collect();
    !state["links"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|l| l["root"].as_str().is_some_and(|r| roots.contains(r)))
        && repos.contains(target)
        && !state["aliasAsked"]
            .as_array()
            .is_some_and(|a| a.iter().any(|v| v == &checkout.repo_id))
        && repo_of(state, &checkout.repo_id) == checkout.repo_id
        && derive_alias(&state["aliases"], &checkout.repo_id, target) == "assign"
}

pub fn offer_fork_alias(
    state: &mut Value,
    checkout: &ICheckout,
    repos: &HashSet<String>,
    confirm: &dyn Fn(&str, &str) -> Result<bool>,
) -> Result<()> {
    if !should_ask_alias(state, checkout, repos) {
        return Ok(());
    }
    let target = checkout.upstream_repo_id.as_deref().unwrap_or_default();
    if !state["aliasAsked"].is_array() {
        state["aliasAsked"] = Value::Array(Vec::new());
    }
    if let Some(asked) = state["aliasAsked"].as_array_mut() {
        asked.push(checkout.repo_id.clone().into());
    }
    if confirm(&checkout.repo_id, target)? {
        state["aliases"][&checkout.repo_id] = target.into();
    }
    Ok(())
}
