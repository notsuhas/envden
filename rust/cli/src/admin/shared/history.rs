use super::context::IAdminContext;
use crate::{
    client::binary,
    vault::history::{IVaultHistory, read_history},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::Value;

pub fn check_floor(local: &Value, history: &IVaultHistory) -> Result<()> {
    for encoded in local["headers"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
    {
        let stored: p::ISigned<p::IManifestHeader> = p::decode(&binary(encoded)?)?;
        let remote = history
            .headers
            .iter()
            .find(|h| h.body.seq == stored.body.seq)
            .ok_or_else(|| {
                EnvdenError::new(
                    ErrorCode::Rollback,
                    "Server is behind this device; run envden server repair",
                )
            })?;
        if p::object_hash(&stored, "manifest")? != p::object_hash(remote, "manifest")? {
            return Err(EnvdenError::new(
                ErrorCode::Fork,
                "Server history conflicts with stored headers",
            ));
        }
    }
    Ok(())
}

pub fn current_history(context: &IAdminContext<'_>) -> Result<IVaultHistory> {
    let history = read_history(&context.client, &context.vault_id, None)?;
    check_floor(&context.local, &history)?;
    Ok(history)
}
