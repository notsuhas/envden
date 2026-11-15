use super::{
    approval::{checkout_approval, checkout_value},
    checkout::{
        mode::supported_placement,
        worktree::{auto_approved_worktree, worktree_approved_notice},
    },
    file::{IOwnLink, link_file},
    takeover::sibling::sibling_link,
};
use crate::{adapters::IAdapters, settings::read_config, state::lock::with_state_lock};
use envden_core::{
    adapters::{ICheckout, IEnvFileRules},
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::Value;

pub fn link_checkout(
    adapters: &IAdapters,
    state: &mut Value,
    checkout: &ICheckout,
    approve: &dyn Fn(&ICheckout) -> Result<bool>,
    copy: bool,
    report: &dyn Fn(&str),
) -> Result<Vec<IOwnLink>> {
    with_state_lock(&adapters.home, (adapters.now)(), || {
        let approval = checkout_approval(state, checkout);
        if approval == "changed" {
            return Err(EnvdenError::new(
                ErrorCode::Conflict,
                "Checkout remote changed; use envden alias",
            ));
        }
        if approval == "ask" {
            if auto_approved_worktree(adapters, state, checkout)? {
                report(&worktree_approved_notice(checkout));
            } else if !approve(checkout)? {
                return Ok(Vec::new());
            }
        }
        let approved = state["approved"]
            .as_array_mut()
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Unreadable local state"))?;
        approved.retain(|a| a["root"] != checkout.root);
        approved.push(checkout_value(checkout));
        let placement = supported_placement(adapters, &checkout.root, copy)?;
        let config = read_config(&adapters.home)?;
        let rules = config["env-files"].as_object().map(|o| IEnvFileRules {
            include: strings(o.get("include")),
            exclude: strings(o.get("exclude")),
            extra_skipped: strings(o.get("extraSkipped")),
        });
        let paths = adapters.repo.env_files(checkout, rules.as_ref())?;
        let mut own = Vec::new();
        for path in &paths {
            if let Some(link) = link_file(adapters, state, checkout, placement.as_ref(), path)? {
                own.push(link);
            }
        }
        own.retain(|l| !sibling_link(l, &paths));
        Ok(own)
    })
}

fn strings(value: Option<&Value>) -> Option<Vec<String>> {
    value?.as_array().map(|a| {
        a.iter()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect()
    })
}
