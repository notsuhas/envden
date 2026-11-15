use super::material::stored_swap;
use crate::{
    auth::{has_proof, session_key},
    http::types::IAppOptions,
    middleware::IAuth,
};
use envden_core::{
    adapters::storage::*,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::{
    chain::{TDeviceListResult, verify_chain},
    protocol::*,
};

fn validate(swap: &ISwap, auth: &IAuth, public: &[u8; 32]) -> Result<()> {
    let invalid = || EnvdenError::new(ErrorCode::InvalidData, "Invalid creation");
    let TDeviceListResult::Valid { state } = verify_chain(&swap.entries)? else {
        return Err(invalid());
    };
    let Some(signer) = state.devices.values().next() else {
        return Err(invalid());
    };
    let header = &swap.header.body;
    if swap.entries.len() != 2
        || state.vault_id != auth.request.vault_id
        || state.server_pin != server_pin(public)?
        || header.vault_id != auth.request.vault_id
        || header.seq != 1
        || header.op != 0
        || header.epoch != 1
        || header.list_seq != 1
        || header.list_head != state.head
        || header.prev != [0; 32]
        || swap.expected_head != [0; 32]
        || header.signer != auth.request.device
        || signer.id != auth.request.device
        || !verify_object(&swap.header, &signer.obj_pub, "manifest")
    {
        return Err(invalid());
    }
    if swap.files.as_ref().is_none_or(|f| {
        !f.entries.is_empty()
            || encode(f).is_err()
            || h("files", &encode(f).unwrap_or_default()) != header.files_hash
    }) || swap
        .keyring
        .as_ref()
        .is_none_or(|b| h("keyring-blob", b) != header.keyring_hash)
        || swap
            .envelope
            .as_ref()
            .is_none_or(|b| h("envelope-blob", b) != header.envelope_hash)
        || swap.sk_pub.is_none()
        || swap.opaque_record.is_none()
        || swap.approver.is_some()
    {
        return Err(invalid());
    }

    Ok(())
}

pub(crate) fn create_vault(
    options: &IAppOptions,
    auth: &IAuth,
    swap: &ISwap,
    digest: &[u8],
) -> Result<TCommitResult> {
    let storage = options.storage.as_ref();
    let id = &auth.request.vault_id;
    let mut result = None;
    storage.transaction(&mut || {
        let mut stored = stored_swap(swap, digest)?;
        if storage.has_vault(id)? {
            if storage.find_committed(id, digest)? {
                result = Some(TCommitResult::RetryOfCommitted);
                return Ok(());
            }
            return Err(EnvdenError::new(
                ErrorCode::Conflict,
                "Vault already exists",
            ));
        }
        if !has_proof(options, auth, "setup")? {
            return Err(EnvdenError::new(
                ErrorCode::Unauthorized,
                "Setup proof required",
            ));
        }
        validate(swap, auth, &options.server_keys.public_key)?;
        let key = session_key(auth, "registration-record");
        if storage.session(id, &key, (options.now)())?.as_ref() != swap.opaque_record.as_ref() {
            return Err(EnvdenError::new(
                ErrorCode::Unauthorized,
                "Staged registration required",
            ));
        }
        let authority = session_key(auth, "registration-authority");
        if storage.session(id, &authority, (options.now)())? != storage.setup_token()? {
            return Err(EnvdenError::new(
                ErrorCode::Unauthorized,
                "Registration token mismatch",
            ));
        }
        stored.consume_sessions = Some(vec![key, authority]);
        stored.setup_token_hash = storage.setup_token()?;
        stored.vault = Some(IStoredVault {
            active: true,
            unlock_period: Some(2592000000),
            ..Default::default()
        });
        stored.devices = Some(vec![IDeviceWrite {
            id: auth.request.device.to_vec(),
            state: IStoredDevice {
                unlocked_until: (options.now)() + 2592000000,
                fresh_until: (options.now)() + 600000,
                client_version: auth.request.client_version.clone(),
                mailbox_grant: None,
            },
        }]);
        result = Some(storage.commit_swap(id, None, &stored, (options.now)())?);
        if let Some(receipt) = storage.consume_session(
            id,
            &session_key(auth, "registration-receipt"),
            (options.now)(),
        )? {
            storage.refund(&String::from_utf8_lossy(&receipt), (options.now)())?;
        }

        Ok(())
    })?;

    Ok(result.expect("transaction result"))
}
