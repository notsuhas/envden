use super::IAuth;
use crate::http::types::IAppOptions;
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub(crate) fn require_gate(options: &IAppOptions, auth: &IAuth, fresh: bool) -> Result<()> {
    let state = options
        .storage
        .device(&auth.request.vault_id, &auth.request.device)?;
    let never = !fresh
        && options
            .storage
            .vault(&auth.request.vault_id)?
            .is_some_and(|v| v.unlock_period.is_none());
    let until = state.map(|v| {
        if fresh {
            v.fresh_until
        } else {
            v.unlocked_until
        }
    });
    if !auth.member || (!never && until.is_none_or(|until| (options.now)() >= until)) {
        return Err(EnvdenError::new(ErrorCode::Locked, "Login required"));
    }

    Ok(())
}
