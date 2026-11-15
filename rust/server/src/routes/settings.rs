use crate::{
    http::{errors::response, types::IAppOptions},
    middleware::{IAuth, require_gate},
};
use axum::{body::Body, http::Response};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::IUnlockPeriod;
use serde_json::json;

pub(super) fn settings(
    options: &IAppOptions,
    auth: &IAuth,
    path: &str,
    method: &str,
    body: &[u8],
) -> Result<Option<Response<Body>>> {
    let id = &auth.request.vault_id;
    if !matches!(path, "/v1/settings/unlock-period" | "/v1/unlock-window") {
        return Ok(None);
    }
    require_gate(options, auth, method == "PUT")?;
    let mut vault = options
        .storage
        .vault(id)?
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Unknown vault"))?;
    if method == "PUT" {
        let period: IUnlockPeriod = serde_json::from_slice(body)
            .map_err(|_| EnvdenError::new(ErrorCode::InvalidInput, "Invalid input"))?;
        vault.unlock_period = period.period;
        options.storage.transaction(&mut || {
            options.storage.configure_vault(id, &vault, &[], None)?;
            if let Some(period) = period.period {
                options.storage.cap_unlocks(id, (options.now)() + period)?;
            }
            Ok(())
        })?;
    }
    let value = if path == "/v1/unlock-window" {
        let state = options
            .storage
            .device(id, &auth.request.device)?
            .unwrap_or_default();
        json!({"unlockedUntil":vault.unlock_period.map(|_|state.unlocked_until),"freshUntil":state.fresh_until})
    } else {
        json!({"period":vault.unlock_period})
    };

    Ok(Some(response(200, "application/json", value.to_string())))
}
