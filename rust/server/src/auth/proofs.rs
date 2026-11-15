use crate::{http::types::IAppOptions, middleware::IAuth};
use envden_core::{
    adapters::storage::TStateKind,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::*;

pub(crate) fn has_proof(options: &IAppOptions, auth: &IAuth, kind: &str) -> Result<bool> {
    let Some(proof) = &auth.proof else {
        return Ok(false);
    };
    let storage = options.storage.as_ref();
    let request = &auth.request;
    let vault = storage.vault(&request.vault_id)?;
    if kind == "sk" {
        let public = storage.state(&request.vault_id, TStateKind::SkPub, &[])?;

        return Ok(!vault.is_some_and(|v| v.sk_refused)
            && public.is_some_and(|key| {
                fixed(&key)
                    .ok()
                    .is_some_and(|key| verify_sk_proof(&key, request, proof).unwrap_or(false))
            }));
    }
    if kind == "setup" && storage.has_vault(&request.vault_id)? {
        return Ok(false);
    }
    let key = if kind == "setup" {
        storage.setup_token()?
    } else {
        vault.and_then(|v| v.restored).map(|r| r.repair_token_hash)
    };
    let Some(key) = key else {
        return Ok(false);
    };

    verify_token_proof(
        if kind == "setup" {
            TTokenKind::Setup
        } else {
            TTokenKind::Repair
        },
        &fixed(&key)?,
        request,
        proof,
    )
}

pub(crate) fn require_ticket(options: &IAppOptions, auth: &IAuth) -> Result<()> {
    let mut key = super::session_key(auth, "kit");
    key.kind = envden_core::adapters::storage::TSessionKind::JoinTicket;
    if options
        .storage
        .session(&auth.request.vault_id, &key, (options.now)())?
        .is_none()
    {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Join ticket required",
        ));
    }

    Ok(())
}
