use crate::{
    adapters::IAdapters,
    onboarding::{ICheckoutOptions, setup_checkouts},
    program::IInvocation,
    state::{lock::with_state_lock, repository::load_state, require_configured},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::path::PathBuf;

pub fn run_track(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let path = invocation
        .arguments
        .first()
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(|| {
            std::env::current_dir().map_err(|cause| {
                EnvdenError::with_source(
                    ErrorCode::InvalidInput,
                    "Current directory is unavailable",
                    cause,
                )
            })
        })?;
    with_state_lock(&adapters.home, (adapters.now)(), || {
        let mut state = require_configured(load_state(&adapters.home)?)?;
        setup_checkouts(
            adapters,
            &mut state,
            &ICheckoutOptions {
                scan_root: Some(vec![path]),
                copy: invocation.options.get("copy").is_some_and(|v| v == true),
                verbose: invocation.options.get("verbose").is_some_and(|v| v == true),
                command: Some("track"),
                ..Default::default()
            },
        )
    })
}
