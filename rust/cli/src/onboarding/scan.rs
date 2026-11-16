use super::checkouts::{
    chosen_checkouts, find_checkouts, report_own_links, report_repo_skips, rescan_command,
};
use crate::{
    adapters::IAdapters,
    client::UreqTransport,
    links::{fork::offer_fork_alias, place::link_checkout, takeover::offer::offer_takeover},
    output::prompts::consent,
    state::{
        lock::with_state_lock,
        repository::{load_state, save_state},
    },
    sync::remote::{
        content::{entry_name, readable_entries},
        context::{ISyncOptions, sync_context},
    },
};
use envden_core::filesystem::ICanonicalPath;
use envden_core::{adapters::ICheckout, errors::Result};
use serde_json::Value;
use std::{collections::HashSet, path::PathBuf, rc::Rc};

type TApproval<'a> = &'a dyn Fn(&ICheckout) -> Result<bool>;
type TAlias<'a> = &'a dyn Fn(&str, &str) -> Result<bool>;
type TTakeover<'a> = &'a dyn Fn(&str) -> Result<bool>;

#[derive(Default)]
pub struct ICheckoutOptions<'a> {
    pub copy: bool,
    pub scan_root: Option<Vec<PathBuf>>,
    pub exclude_root: Option<Vec<PathBuf>>,
    pub approve: Option<TApproval<'a>>,
    pub alias: Option<TAlias<'a>>,
    pub take_over: Option<TTakeover<'a>>,
    pub verbose: bool,
    pub command: Option<&'a str>,
}

pub fn setup_checkouts(
    adapters: &IAdapters,
    state: &mut Value,
    options: &ICheckoutOptions<'_>,
) -> Result<()> {
    with_state_lock(&adapters.home, (adapters.now)(), || {
        let mut current = load_state(&adapters.home)?.unwrap_or_else(|| state.clone());
        scan(adapters, &mut current, options)?;
        *state = current;
        Ok(())
    })
}

fn scan(adapters: &IAdapters, state: &mut Value, options: &ICheckoutOptions<'_>) -> Result<()> {
    let stored_repos = vault_repos(adapters, state)?;
    let (eligible, skips) = find_checkouts(
        adapters,
        state,
        &stored_repos,
        options.scan_root.as_deref(),
        options.exclude_root.as_deref().unwrap_or_default(),
    )?;
    let home = adapters
        .user_home
        .canonical_path()
        .unwrap_or_else(|_| adapters.user_home.clone());
    let command = rescan_command(
        options.command.unwrap_or("track"),
        options.scan_root.as_deref(),
        options.exclude_root.as_deref(),
        &home,
    );
    report_repo_skips(&skips, &home, options.verbose, &command);
    let selected = if options.approve.is_some() {
        eligible.into_iter().map(|item| item.checkout).collect()
    } else {
        chosen_checkouts(adapters, state, eligible)?
    };
    let mut own_links = vec![];
    for checkout in selected {
        let alias = |source: &str, target: &str| {
            consent(
                &format!(
                    "{source} looks like a fork of {target}. Share its env files with {target}?"
                ),
                false,
            )
        };
        offer_fork_alias(
            state,
            &checkout,
            &stored_repos,
            options.alias.unwrap_or(&alias),
        )?;
        save_state(&adapters.home, state, (adapters.now)())?;
        own_links.extend(link_checkout(
            adapters,
            state,
            &checkout,
            options.approve.unwrap_or(&|_| Ok(true)),
            options.copy,
            &|message| println!("{message}"),
        )?);
        save_state(&adapters.home, state, (adapters.now)())?;
    }
    let left = offer_takeover(adapters, state, own_links, options.copy, options.take_over)?;
    save_state(&adapters.home, state, (adapters.now)())?;
    report_own_links(&left, &home, options.verbose, &command);
    Ok(())
}

fn vault_repos(adapters: &IAdapters, state: &Value) -> Result<HashSet<String>> {
    if !crate::state::truthy(&state["checkpoint"]) {
        return Ok(HashSet::new());
    }
    let context = sync_context(
        adapters,
        ISyncOptions {
            now: Rc::new(adapters.now),
            unlock: None,
            cwd: None,
            all: true,
            yes: false,
            interactive: false,
            choose: None,
            confirm: None,
            report: None,
        },
        Rc::new(UreqTransport),
    )?;
    readable_entries(&context)?
        .iter()
        .filter(|entry| matches!(entry.state, 1 | 3))
        .map(|entry| entry_name(&context, entry).map(|name| name.repo_id))
        .collect()
}

#[cfg(test)]
mod tests;
