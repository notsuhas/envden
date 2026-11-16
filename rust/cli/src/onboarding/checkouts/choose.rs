use super::IEligible;
use crate::{
    adapters::IAdapters,
    links::{approval::checkout_label, checkout::worktree::auto_approved_worktree},
    output::prompts::choose_many,
};
use envden_core::filesystem::ICanonicalPath;
use envden_core::{
    adapters::ICheckout,
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::Value;
use std::{
    collections::HashSet,
    io::{self, IsTerminal},
};

pub(in crate::onboarding) fn chosen_checkouts(
    adapters: &IAdapters,
    state: &Value,
    eligible: Vec<IEligible>,
) -> Result<Vec<ICheckout>> {
    let mut automatic = vec![];
    let mut asked = vec![];
    for item in eligible {
        if state["approved"]
            .as_array()
            .is_some_and(|a| a.iter().any(|a| a["root"] == item.checkout.root))
            || auto_approved_worktree(adapters, state, &item.checkout)?
        {
            automatic.push(item.checkout);
        } else {
            asked.push(item);
        }
    }
    if asked.is_empty() {
        return Ok(automatic);
    }
    if !io::stdin().is_terminal() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Approve checkouts in your own terminal with envden track",
        ));
    }
    let home = adapters
        .user_home
        .canonical_path()
        .unwrap_or_else(|_| adapters.user_home.clone());
    let options = asked
        .iter()
        .map(|item| {
            (
                item.checkout.root.clone(),
                checkout_label(state, &item.checkout, &item.files, &home),
            )
        })
        .collect::<Vec<_>>();
    let roots: HashSet<_> = choose_many("Sync env files for these checkouts?", &options)?
        .into_iter()
        .collect();
    if roots.is_empty() {
        println!("No checkouts selected. Add one later with: envden track <path>");
    }
    automatic.extend(
        asked
            .into_iter()
            .filter(|item| roots.contains(&item.checkout.root))
            .map(|item| item.checkout),
    );
    Ok(automatic)
}
