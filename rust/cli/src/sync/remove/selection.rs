use crate::{adapters::IAdapters, links::approval::checkout_approval};
use envden_core::errors::Result;
use serde_json::Value;
use std::path::{Path, PathBuf};

type TTargets = (Vec<Value>, Vec<PathBuf>, bool);

pub(super) fn select_targets(adapters: &IAdapters, state: &Value, store: &str) -> Result<TTargets> {
    let mut targets = Vec::new();
    let mut skipped = Vec::new();
    let mut blocked = false;
    for link in state["links"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|l| l["store"] == store && l["localOnly"] != true)
    {
        let root = link["root"].as_str().unwrap_or_default();
        let destination = Path::new(root).join(link["path"].as_str().unwrap_or_default());
        if !adapters
            .repo
            .checkout_at(root)?
            .is_some_and(|c| checkout_approval(state, &c) == "approved")
        {
            skipped.push(destination);
            blocked |= link["mode"] == "link";
        } else {
            targets.push(link.clone());
        }
    }

    Ok((targets, skipped, blocked))
}
