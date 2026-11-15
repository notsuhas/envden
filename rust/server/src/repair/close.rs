use crate::{
    auth::{has_proof, session_key},
    http::types::IAppOptions,
    middleware::IAuth,
};
use envden_core::{
    adapters::storage::{IDeviceWrite, IStoredDevice, IStoredSwap, TStateKind},
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::{
    chain::{refuse_secret_key_proof, repair_login_decision},
    protocol::*,
};

pub(crate) fn repair_history(options: &IAppOptions, id: &[u8]) -> Result<Vec<IManifestHeader>> {
    let restored = options.storage.vault(id)?.and_then(|v| v.restored);
    let Some(restored) = restored else {
        return Ok(vec![]);
    };
    let Some(point) = options.storage.header(id, &restored.restored_head)? else {
        return Ok(vec![]);
    };

    options
        .storage
        .headers(id, point.seq + 1, u64::MAX, None, None)?
        .iter()
        .map(|row| decode::<ISigned<IManifestHeader>>(&row.bytes).map(|h| h.body))
        .collect()
}

pub(crate) fn require_repair(options: &IAppOptions, auth: &IAuth) -> Result<()> {
    if options
        .storage
        .vault(&auth.request.vault_id)?
        .is_none_or(|v| v.restored.is_none())
        || !has_proof(options, auth, "repair")?
    {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Repair proof required",
        ));
    }

    Ok(())
}

pub(crate) fn close_repair(
    options: &IAppOptions,
    auth: &IAuth,
    swap: &ISwap,
    stored: &mut IStoredSwap,
) -> Result<()> {
    let id = &auth.request.vault_id;
    let mut vault = options.storage.vault(id)?.expect("authorized vault");
    let restored = vault
        .restored
        .clone()
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Repair identity mismatch"))?;
    let Some(TEntryPayload::RepairDone(done)) = swap.entries.first().map(|e| &e.body.change) else {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Repair identity mismatch",
        ));
    };
    if done.restored_head.as_slice() != restored.restored_head
        || Some(done.repair_id.as_slice()) != restored.finish_progress.as_deref()
    {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Repair identity mismatch",
        ));
    }
    let history = repair_history(options, id)?;
    let purpose = if repair_login_decision(&history) == "login" {
        "repair-finish"
    } else {
        "registration-repair"
    };
    let key = session_key(auth, purpose);
    if options
        .storage
        .session(id, &key, (options.now)())?
        .as_deref()
        != Some(restored.repair_token_hash.as_slice())
    {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Finishing login required",
        ));
    }
    stored.consume_sessions.get_or_insert_default().push(key);
    let envelope = options.storage.state(id, TStateKind::Envelope, &[])?;
    vault.restored = None;
    vault.sk_refused |= refuse_secret_key_proof(
        &history,
        envelope.is_some_and(|b| h("envelope-blob", &b) == swap.header.body.envelope_hash),
    );
    let period = vault.unlock_period.unwrap_or(2592000000);
    stored.vault = Some(vault);
    stored.clear_repair_reports = Some(true);
    stored.devices = Some(vec![IDeviceWrite {
        id: auth.request.device.to_vec(),
        state: IStoredDevice {
            unlocked_until: (options.now)() + period,
            fresh_until: (options.now)() + 600000,
            client_version: auth.request.client_version.clone(),
            mailbox_grant: None,
        },
    }]);

    Ok(())
}
