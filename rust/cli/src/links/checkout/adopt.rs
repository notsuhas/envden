use crate::{
    adapters::IAdapters,
    links::{
        approval::checkout_value,
        checkout::worktree::{auto_approved_worktree, worktree_approved_notice},
    },
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

pub fn adopt_worktree_at(
    adapters: &IAdapters,
    state: &mut Value,
    path: &str,
    report: &dyn Fn(&str),
) -> Result<()> {
    let Some(checkout) = adapters.repo.checkout_at(path).ok().flatten() else {
        return Ok(());
    };
    if !auto_approved_worktree(adapters, state, &checkout)? {
        return Ok(());
    }
    state["approved"]
        .as_array_mut()
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Unreadable local state"))?
        .push(checkout_value(&checkout));
    report(&worktree_approved_notice(&checkout));
    Ok(())
}
