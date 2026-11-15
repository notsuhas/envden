use super::{charge, has_proof, session_key};
use crate::{
    http::{encoding::binary, types::IAppOptions},
    middleware::IAuth,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::*;
use serde_json::{Value, json};

pub(crate) fn authorize_registration(options: &IAppOptions, auth: &IAuth) -> Result<()> {
    if options
        .storage
        .vault(&auth.request.vault_id)?
        .is_some_and(|v| !v.active)
    {
        return crate::moving::require_move(options, auth);
    }
    if options
        .storage
        .vault(&auth.request.vault_id)?
        .is_some_and(|v| v.restored.is_some())
        && envden_protocol::chain::repair_login_decision(&crate::repair::repair_history(
            options,
            &auth.request.vault_id,
        )?) != "register"
    {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Repair login required",
        ));
    }
    let state = options
        .storage
        .device(&auth.request.vault_id, &auth.request.device)?;
    let fresh = auth.member && state.is_some_and(|state| (options.now)() < state.fresh_until);
    if !fresh
        && !has_proof(options, auth, "setup")?
        && !(auth.member
            && (has_proof(options, auth, "sk")? || has_proof(options, auth, "repair")?))
    {
        return Err(EnvdenError::new(ErrorCode::Unauthorized, "Proof required"));
    }

    Ok(())
}

pub(crate) fn start_registration(
    options: &IAppOptions,
    auth: &IAuth,
    message: &str,
    receipt: Option<&str>,
) -> Result<Value> {
    authorize_registration(options, auth)?;
    let receipt = match receipt {
        Some(receipt) => receipt.to_owned(),
        None => charge(options, auth)?,
    };
    let token = if has_proof(options, auth, "setup")? {
        options.storage.setup_token()?
    } else {
        options
            .storage
            .vault(&auth.request.vault_id)?
            .and_then(|v| v.restored)
            .map(|r| r.repair_token_hash)
    };
    if let Some(token) = token {
        options.storage.put_session(
            &auth.request.vault_id,
            &session_key(auth, "registration-authority"),
            &token,
            (options.now)(),
        )?;
    }
    let result = opaque_registration_response(ICreateServerRegistrationResponseParams {
        server_setup: options.server_keys.opaque_setup.clone(),
        user_identifier: unlock_identifiers(&auth.request.vault_id).user_identifier,
        registration_request: message.into(),
    })?;
    options.storage.put_session(
        &auth.request.vault_id,
        &session_key(auth, "registration"),
        receipt.as_bytes(),
        (options.now)(),
    )?;

    Ok(json!({"message":result.registration_response}))
}

pub(crate) fn finish_registration(
    options: &IAppOptions,
    auth: &IAuth,
    message: &str,
) -> Result<Value> {
    authorize_registration(options, auth)?;
    let id = &auth.request.vault_id;
    let token = if has_proof(options, auth, "setup")? {
        options.storage.setup_token()?
    } else {
        options
            .storage
            .vault(id)?
            .and_then(|v| v.restored)
            .map(|r| r.repair_token_hash)
    };
    if let Some(token) = token
        && options.storage.session(
            id,
            &session_key(auth, "registration-authority"),
            (options.now)(),
        )? != Some(token)
    {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Registration token changed",
        ));
    }
    let receipt = options
        .storage
        .consume_session(id, &session_key(auth, "registration"), (options.now)())?
        .ok_or_else(|| {
            EnvdenError::new(ErrorCode::Unauthorized, "Registration expired or consumed")
        })?;
    options.storage.transaction(&mut || {
        if options.storage.vault(id)?.is_some_and(|v| !v.active) {
            use envden_core::adapters::storage::{IStateWrite, TStateKind};
            options.storage.write_state(
                id,
                &[
                    IStateWrite {
                        kind: TStateKind::MoveSession,
                        key: b"registration".to_vec(),
                        bytes: Some(binary(message, None)?),
                    },
                    IStateWrite {
                        kind: TStateKind::MoveSession,
                        key: b"registration-receipt".to_vec(),
                        bytes: Some(receipt.clone()),
                    },
                ],
            )?;
        }
        options.storage.put_session(
            id,
            &session_key(auth, "registration-record"),
            &binary(message, None)?,
            (options.now)(),
        )?;
        if let Some(restored) = options.storage.vault(id)?.and_then(|v| v.restored) {
            options.storage.put_session(
                id,
                &session_key(auth, "registration-repair"),
                &restored.repair_token_hash,
                (options.now)(),
            )?;
        }
        options.storage.put_session(
            id,
            &session_key(auth, "registration-receipt"),
            &receipt,
            (options.now)(),
        )
    })?;

    Ok(json!({"kind":"registered"}))
}
