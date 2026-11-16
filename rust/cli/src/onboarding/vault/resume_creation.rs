use super::connection::connection;
use crate::{
    adapters::IAdapters, identity::IDeviceIdentity, session::record_unlock_window,
    state::repository::save_state,
};
use envden_core::errors::{ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::Value;
use std::rc::Rc;

pub(super) fn resume(
    adapters: &IAdapters,
    options: &Value,
    address: &str,
    token: &([u8; 20], [u8; 32]),
    identity: &IDeviceIdentity,
    credentials: (&str, &str),
    existing: Option<Value>,
) -> Result<Option<Value>> {
    let (name, password) = credentials;
    if let Some(mut pending) = existing
        && let Some((swap, bytes, vault_id)) =
            super::pending::resumable(adapters, &pending, &identity.record.id)?
    {
        let mut client = connection(
            adapters,
            pending["server"]["address"].as_str().unwrap_or(address),
            token.1,
            vault_id,
            identity,
        );
        let key = p::token_key(p::TTokenKind::Setup, &token.0);
        client.options.proof = Some(Rc::new(move |request| {
            p::token_proof(p::TTokenKind::Setup, &key, request).map(|v| v.to_vec())
        }));
        let kit = super::pending_kit::resume_secret(options)?
            .map(|secret| {
                super::pending_kit::resumed_kit(
                    &swap,
                    pending["vaultId"].as_str().unwrap_or_default(),
                    address,
                    &secret,
                )
            })
            .transpose()?;
        match client.request_bytes("/v1/vault", "POST", &bytes) {
            Ok(_) => {
                pending
                    .as_object_mut()
                    .expect("state")
                    .shift_remove("creationPending");
                record_unlock_window(&client, &mut pending)?;
                save_state(&adapters.home, &pending, (adapters.now)())?;
                return if kit.is_some() {
                    Ok(Some(pending))
                } else {
                    super::pending_kit::replace_lost(adapters, options, name, password).map(Some)
                };
            }
            Err(error) if error.code == ErrorCode::Unauthorized => {}
            Err(error) => return Err(error),
        }
    }
    Ok(None)
}
