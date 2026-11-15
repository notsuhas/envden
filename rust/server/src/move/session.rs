use crate::{
    auth::has_proof,
    http::types::IAppOptions,
    middleware::{IAuth, require_gate},
};
use envden_core::{
    adapters::storage::{IStateWrite, IStoredVault, TStateKind},
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::IUnlockPeriod;
use serde_json::{Value, json};

pub(crate) fn require_move(options: &IAppOptions, auth: &IAuth) -> Result<()> {
    let id = &auth.request.vault_id;
    let vault = options.storage.vault(id)?;
    if vault.is_none_or(|v| v.active)
        || options
            .storage
            .state(id, TStateKind::MoveSession, &[])?
            .as_deref()
            != Some(auth.request.device.as_slice())
    {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Move session required",
        ));
    }

    Ok(())
}

pub(crate) fn move_route(
    options: &IAppOptions,
    auth: &IAuth,
    path: &str,
    method: &str,
    body: &[u8],
) -> Result<Option<Value>> {
    let id = &auth.request.vault_id;
    let storage = options.storage.as_ref();
    let result = match path {
        "/v1/move/session" => {
            if *id == [0; 32] {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidInput,
                    "Invalid vault ID",
                ));
            }
            if require_move(options, auth).is_ok() {
                return Ok(Some(json!({"kind":"moving"})));
            }
            if !has_proof(options, auth, "setup")? {
                return Err(EnvdenError::new(
                    ErrorCode::Unauthorized,
                    "Setup proof required",
                ));
            }
            storage.configure_vault(
                id,
                &IStoredVault {
                    unlock_period: Some(2592000000),
                    ..Default::default()
                },
                &[IStateWrite {
                    kind: TStateKind::MoveSession,
                    key: vec![],
                    bytes: Some(auth.request.device.to_vec()),
                }],
                storage.setup_token()?.as_deref(),
            )?;
            json!({"kind":"moving"})
        }
        "/v1/move/freeze" | "/v1/move/unfreeze" => {
            require_gate(options, auth, true)?;
            let mut vault = storage
                .vault(id)?
                .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Unknown vault"))?;
            let frozen = path.ends_with("/freeze");
            if frozen && vault.sk_refused {
                return Err(EnvdenError::new(
                    ErrorCode::RecoveryKitRequired,
                    "Replace recovery kit before moving",
                ));
            }
            if vault.server_moved.is_some() {
                return Err(EnvdenError::new(ErrorCode::Moving, "Move committed"));
            }
            vault.frozen = frozen;
            storage.configure_vault(
                id,
                &vault,
                &[IStateWrite {
                    kind: TStateKind::MoveSession,
                    key: vec![],
                    bytes: if frozen {
                        Some(auth.request.device.to_vec())
                    } else {
                        None
                    },
                }],
                None,
            )?;
            json!({"kind":if frozen {"frozen"} else {"unfrozen"}})
        }
        "/v1/move/discard" => {
            require_move(options, auth)?;
            storage.discard_inactive_vault(id)?;
            json!({"kind":"unfrozen"})
        }
        "/v1/move/period" => {
            if method == "GET" {
                require_gate(options, auth, true)?;
                json!({"period":storage.vault(id)?.and_then(|v|v.unlock_period)})
            } else {
                require_move(options, auth)?;
                let period: IUnlockPeriod = serde_json::from_slice(body)
                    .map_err(|_| EnvdenError::new(ErrorCode::InvalidInput, "Invalid input"))?;
                let mut vault = storage
                    .vault(id)?
                    .ok_or_else(|| EnvdenError::new(ErrorCode::Internal, "Vault unavailable"))?;
                vault.unlock_period = period.period;
                storage.configure_vault(id, &vault, &[], None)?;
                json!({"kind":"updated"})
            }
        }
        _ => {
            return Ok(None);
        }
    };

    Ok(Some(result))
}
