use crate::{
    adapters::IAdapters,
    client::{IClient, binary},
    identity::IDeviceIdentity,
    onboarding::accept::accept,
    state::lock::with_state_lock,
    vault::history::read_history,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::Value;
use zeroize::Zeroizing;

pub(super) fn resume(
    adapters: &IAdapters,
    client: &IClient,
    identity: &IDeviceIdentity,
    rejoin: bool,
) -> Result<Value> {
    with_state_lock(&adapters.home, &adapters.now, || {
        let result = locked_resume(adapters, client, identity, rejoin);
        if result.as_ref().is_err_and(|error| {
            matches!(
                error.code,
                ErrorCode::InvalidData
                    | ErrorCode::Fork
                    | ErrorCode::Unauthorized
                    | ErrorCode::Conflict
            )
        }) {
            super::persistence::clear(adapters)?;
        }
        result
    })
}

fn locked_resume(
    adapters: &IAdapters,
    client: &IClient,
    identity: &IDeviceIdentity,
    rejoin: bool,
) -> Result<Value> {
    if !rejoin {
        super::persistence::guard(adapters)?;
    }
    let receive = format!("envden/{}/pair-receive", adapters.home.display());
    let key =
        Zeroizing::new(adapters.keychain.get(&receive, false)?.ok_or_else(|| {
            EnvdenError::new(ErrorCode::NotFound, "No pairing exchange to resume")
        })?);
    let response = client
        .request("/v1/pairing/approver", "GET", None)?
        .json()?;
    let message: p::IMessageResponse = serde_json::from_value(response).map_err(|cause| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid pairing response", cause)
    })?;
    let receive_key = Zeroizing::new(p::fixed(&key)?);
    let approval = p::open_pair_approver(&binary(&message.message)?, &receive_key)?;
    drop(receive_key);
    drop(key);
    if approval.server_pin != client.options.pin {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Pairing server pin mismatch",
        ));
    }
    let client = client.for_vault(approval.vault_id);
    let history = read_history(&client, &approval.vault_id, None)?;
    if rejoin {
        crate::admin::rejoin::classify::check(adapters, &history)?;
    }
    let local = accept(
        adapters,
        &client,
        identity,
        &history,
        &approval.manifest_hash,
    )?;
    if rejoin {
        crate::admin::rejoin::classify::finish_identity(adapters)?;
    }
    super::persistence::clear(adapters)?;
    Ok(local)
}
