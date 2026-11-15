use crate::{
    adapters::IAdapters,
    state::{lock::with_state_lock, repository::load_state},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::collections::HashSet;

pub fn alias_unlinked_repo(adapters: &IAdapters, source: &str, target: &str) -> Result<()> {
    with_state_lock(&adapters.home, (adapters.now)(), || {
        if let Some(state) = load_state(&adapters.home)? {
            let roots: HashSet<_> = state["approved"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|a| a["repoId"] == source)
                .filter_map(|a| a["root"].as_str())
                .collect();
            if state["links"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|l| l["root"].as_str().is_some_and(|r| roots.contains(r)))
            {
                return Err(EnvdenError::new(
                    ErrorCode::Conflict,
                    "Cannot alias a repo with placed files; run envden untrack <path> first",
                ));
            }
        }
        crate::links::alias::alias_repo(adapters, source, target)
    })
}
