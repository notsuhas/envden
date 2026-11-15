use crate::{
    adapters::IAdapters,
    client::UreqTransport,
    state::repository::load_state,
    sync::{engine::sync, remote::context::ISyncOptions},
};
use envden_core::errors::Result;
use serde_json::Value;
use std::rc::Rc;

pub(super) fn first_run(adapters: &IAdapters) -> Result<Value> {
    sync(
        adapters,
        ISyncOptions {
            now: adapters.now,
            cwd: std::env::current_dir().ok(),
            all: true,
            yes: false,
            interactive: true,
            choose: None,
            confirm: None,
            report: Some(Rc::new(|v| println!("{v}"))),
        },
        Rc::new(UreqTransport),
        false,
    )?;
    let state = crate::state::require_configured(load_state(&adapters.home)?)?;
    crate::notice::cache::refresh_notice(
        &adapters.home,
        &state,
        |root| adapters.repo.case_insensitive(root, true),
        (adapters.now)(),
    )?;
    Ok(state)
}
