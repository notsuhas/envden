use crate::{
    adapters::IAdapters,
    links::{local_only::mark_local_only, takeover::sibling::normalize},
    program::IInvocation,
    state::{lock::with_state_lock, repository::load_state, require_configured},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::path::Path;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let cwd = std::env::current_dir().map_err(crate::state::files::failure)?;
    let file = invocation
        .arguments
        .first()
        .map(String::as_str)
        .unwrap_or_default();
    let absolute = normalize(&cwd.join(file));
    with_state_lock(&adapters.home, &adapters.now, || {
        let mut state = require_configured(load_state(&adapters.home)?)?;
        let link = state["links"]
            .as_array()
            .and_then(|a| {
                a.iter().find(|l| {
                    let root = l["root"].as_str().unwrap_or_default();
                    let path = l["path"].as_str().unwrap_or_default();
                    normalize(&Path::new(root).join(path)) == absolute
                })
            })
            .cloned()
            .ok_or_else(|| {
                EnvdenError::new(ErrorCode::NotFound, "File is not managed by envden")
            })?;
        mark_local_only(
            adapters,
            &mut state,
            link["root"].as_str().unwrap_or_default(),
            link["path"].as_str().unwrap_or_default(),
        )
    })
}
