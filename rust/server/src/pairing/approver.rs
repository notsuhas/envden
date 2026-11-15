use super::lookup::lookup;
use crate::{
    http::{encoding::text, types::IAppOptions},
    middleware::IAuth,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub(super) fn fetch(options: &IAppOptions, auth: &IAuth) -> Result<Vec<u8>> {
    let vault = lookup(
        options.storage.as_ref(),
        &auth.request.vault_id,
        &format!("approver/{}", text(&auth.request.device)),
    )?;
    options
        .storage
        .approver(&vault, &auth.request.device, (options.now)())?
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Approver unavailable"))
}
