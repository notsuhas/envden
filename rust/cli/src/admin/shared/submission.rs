use super::context::IAdminContext;
use crate::vault::history::{IVaultHistory, read_history};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;

pub fn submit_admin(context: &IAdminContext<'_>, swap: &p::ISwap) -> Result<IVaultHistory> {
    context
        .client
        .request_bytes("/v1/swap", "POST", &p::encode(swap)?)?;
    let history = read_history(&context.client, &context.vault_id, None)?;
    let hash = p::object_hash(&swap.header, "manifest")?;
    if !history
        .headers
        .iter()
        .any(|h| p::object_hash(h, "manifest").is_ok_and(|v| v == hash))
    {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Server did not commit the requested swap",
        ));
    }
    Ok(history)
}
