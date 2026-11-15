use crate::{
    http::{encoding::text, types::IAppOptions},
    middleware::IAuth,
};
use envden_core::{
    adapters::storage::{ISessionKey, TRateBucket, TRateCharge, TSessionKind, TStateKind},
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::*;
use serde_json::{Value, json};

pub(crate) fn session_key(auth: &IAuth, purpose: &str) -> ISessionKey {
    ISessionKey {
        kind: TSessionKind::Login,
        device: auth.request.device.to_vec(),
        purpose: purpose.into(),
    }
}

pub(crate) fn charge(options: &IAppOptions, auth: &IAuth) -> Result<String> {
    let bucket = if auth.member {
        TRateBucket::Member {
            device: auth.request.device.to_vec(),
        }
    } else {
        TRateBucket::NonMember
    };
    match options
        .storage
        .charge(&auth.request.vault_id, &bucket, (options.now)())?
    {
        TRateCharge::Charged { receipt } => Ok(receipt),
        TRateCharge::Locked { .. } => Err(EnvdenError::new(
            ErrorCode::RateLimited,
            "Too many attempts",
        )),
    }
}

pub(crate) fn start_login(
    options: &IAppOptions,
    auth: &IAuth,
    purpose: &str,
    message: &str,
    receipt: Option<&str>,
) -> Result<Value> {
    if (purpose == "unlock") != auth.member {
        return Err(EnvdenError::new(
            ErrorCode::NotMember,
            "Invalid login purpose",
        ));
    }
    let receipt = match receipt {
        Some(receipt) => receipt.to_owned(),
        None => charge(options, auth)?,
    };
    let record = options
        .storage
        .state(&auth.request.vault_id, TStateKind::OpaqueRecord, &[])?;
    let identifiers = unlock_identifiers(&auth.request.vault_id);
    let result = opaque_server_start_login(IStartServerLoginParams {
        server_setup: options.server_keys.opaque_setup.clone(),
        registration_record: record.map(|v| text(&v)),
        start_login_request: message.into(),
        user_identifier: identifiers.user_identifier,
        identifiers: Some(identifiers.identifiers),
    })?;
    let session = format!(
        "{{\"state\":\"{}\",\"receipt\":{}}}",
        result.server_login_state,
        serde_json::to_string(&receipt).expect("receipt string")
    );
    options.storage.put_session(
        &auth.request.vault_id,
        &session_key(auth, purpose),
        session.as_bytes(),
        (options.now)(),
    )?;

    Ok(json!({"message":result.login_response}))
}

pub(crate) fn finish_login(
    options: &IAppOptions,
    auth: &IAuth,
    purpose: &str,
    message: &str,
) -> Result<Value> {
    if (purpose == "unlock") != auth.member {
        return Err(EnvdenError::new(
            ErrorCode::NotMember,
            "Invalid login purpose",
        ));
    }
    let id = &auth.request.vault_id;
    let bytes = options
        .storage
        .consume_session(id, &session_key(auth, purpose), (options.now)())?
        .ok_or_else(|| EnvdenError::new(ErrorCode::Unauthorized, "Login expired or consumed"))?;
    let session: Value = serde_json::from_slice(&bytes)
        .map_err(|_| EnvdenError::new(ErrorCode::Internal, "Invalid login session"))?;
    opaque_server_finish_login(IFinishServerLoginParams {
        server_login_state: session["state"].as_str().unwrap_or("").into(),
        finish_login_request: message.into(),
        identifiers: Some(unlock_identifiers(id).identifiers),
    })
    .map_err(|_| {
        EnvdenError::new(
            ErrorCode::Unauthorized,
            "Login failed; vault may have moved",
        )
    })?;
    let mut result = json!({"kind":"ticket"});
    options.storage.transaction(&mut || {
        if purpose == "kit" {
            let mut key = session_key(auth,"kit"); key.kind = TSessionKind::JoinTicket;
            options.storage.put_session(id,&key,&[1],(options.now)())?;
        } else {
            let vault = options.storage.vault(id)?.ok_or_else(||EnvdenError::new(ErrorCode::NotFound,"Unknown vault"))?;
            if let Some(restored) = &vault.restored {
                crate::repair::require_repair(options,auth)?;
                if envden_protocol::chain::repair_login_decision(&crate::repair::repair_history(options,id)?)!="login" {return Err(EnvdenError::new(ErrorCode::Unauthorized,"Registration required"));}
                options.storage.put_session(id,&session_key(auth,"repair-finish"),&restored.repair_token_hash,(options.now)())?;
                result=json!({"kind":"staged"});
                options.storage.refund(session["receipt"].as_str().unwrap_or(""),(options.now)())?;
                return Ok(());
            }
            let mut state = options.storage.device(id,&auth.request.device)?.unwrap_or_default();
            state.unlocked_until = vault.unlock_period.map_or(9007199254740991,|period|(options.now)()+period);
            state.fresh_until = (options.now)()+600000;
            options.storage.put_device(id,&auth.request.device,&state)?;
            result = json!({"kind":"unlocked","unlockedUntil":vault.unlock_period.map(|_|state.unlocked_until),"freshUntil":state.fresh_until});
        }
        options.storage.refund(session["receipt"].as_str().unwrap_or(""),(options.now)())?;

        Ok(())
    })?;

    Ok(result)
}
