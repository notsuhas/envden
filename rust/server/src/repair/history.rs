use crate::{
    http::types::IAppOptions,
    middleware::IAuth,
    vault::{stored_swap, vault_chain},
};
use envden_core::{
    adapters::storage::TCommitResult,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::{chain::*, protocol::*};

pub(crate) fn upload_history(
    options: &IAppOptions,
    auth: &IAuth,
    swap: &ISwap,
    digest: &[u8],
    check_uploader: bool,
) -> Result<TCommitResult> {
    let storage = options.storage.as_ref();
    let id = &auth.request.vault_id;
    let restored = storage.vault(id)?.is_some_and(|v| v.restored.is_some());
    let mut stored = stored_swap(swap, digest)?;
    stored.state.as_mut().expect("swap state").retain(|w| {
        w.kind != envden_core::adapters::storage::TStateKind::OpaqueRecord
            && (!restored || w.kind != envden_core::adapters::storage::TStateKind::SkPub)
    });
    let current = storage.head(id)?;
    if current.is_some() && storage.find_committed(id, digest)? {
        return Ok(TCommitResult::RetryOfCommitted);
    }
    let invalid = || EnvdenError::new(ErrorCode::InvalidData, "Invalid imported history");
    let header = &swap.header.body;
    let state = if current.is_none() {
        let TDeviceListResult::Valid { state } = verify_chain(&swap.entries)? else {
            return Err(invalid());
        };
        if state.vault_id != *id
            || header.vault_id != *id
            || header.op != 0
            || header.seq != 1
            || header.list_seq != 1
            || header.list_head != state.head
            || header.epoch != 1
            || header.prev != [0; 32]
            || swap.expected_head != [0; 32]
            || swap.files.as_ref().is_none_or(|f| {
                !f.entries.is_empty()
                    || encode(f).is_err()
                    || h("files", &encode(f).unwrap_or_default()) != header.files_hash
            })
        {
            return Err(invalid());
        }
        *state
    } else {
        let (previous, before) = vault_chain(&options.storage, id)?;
        if swap.expected_head != object_hash(&previous, "manifest")?
            || header.prev != swap.expected_head
            || header.seq != previous.body.seq + 1
            || header.vault_id != *id
        {
            return Err(invalid());
        }
        let mut state = before.clone();
        for entry in &swap.entries {
            state = apply(Some(&state), entry)?;
        }
        operation_requirement(&previous.body, header, &swap.entries, &before, false)?;
        if let Some(TEntryPayload::RepairDone(done)) = swap.entries.first().map(|e| &e.body.change)
            && storage.header(id, &done.restored_head)?.is_none()
        {
            return Err(invalid());
        }
        let old = storage.file_list(id, &previous.body.files_hash)?;
        if let Some(files) = &swap.files {
            checked_files(Some(files), &header.files_hash)?;
            if let Some(old) = &old {
                changed_files(
                    &decode::<IFiles>(old)?,
                    files,
                    previous.body.epoch,
                    header.epoch,
                    if matches!(header.op, 1 | 11) {
                        Some(header.op)
                    } else {
                        None
                    },
                )?;
            }
        }
        if header.op == 11 && (swap.files.is_none() || old.is_none()) {
            return Err(invalid());
        }
        state
    };
    if header.list_seq != state.seq
        || header.list_head != state.head
        || header.epoch != state.epoch
        || state
            .devices
            .get(&header.signer)
            .is_none_or(|m| !verify_object(&swap.header, &m.obj_pub, "manifest"))
        || (check_uploader && restored && !state.devices.contains_key(&auth.request.device))
        || swap
            .keyring
            .as_ref()
            .is_some_and(|b| h("keyring-blob", b) != header.keyring_hash)
        || swap
            .envelope
            .as_ref()
            .is_some_and(|b| h("envelope-blob", b) != header.envelope_hash)
    {
        return Err(invalid());
    }

    storage.commit_swap(
        id,
        current.as_ref().map(|_| swap.expected_head.as_slice()),
        &stored,
        (options.now)(),
    )
}

pub(crate) fn upload_chain(
    options: &IAppOptions,
    auth: &IAuth,
    swaps: &[ISwap],
) -> Result<TCommitResult> {
    if swaps.is_empty() {
        return Err(EnvdenError::new(ErrorCode::InvalidInput, "Empty history"));
    }
    let mut result = None;
    options.storage.transaction(&mut || {
        for swap in swaps {
            let committed = upload_history(options, auth, swap, &h("swap", &encode(swap)?), false)?;
            if matches!(committed, TCommitResult::HeadMoved { .. }) {
                return Err(EnvdenError::new(ErrorCode::HeadMoved, "History head moved"));
            }
            result = Some(committed);
        }
        if options
            .storage
            .vault(&auth.request.vault_id)?
            .is_some_and(|v| v.restored.is_some())
            && !vault_chain(&options.storage, &auth.request.vault_id)?
                .1
                .devices
                .contains_key(&auth.request.device)
        {
            return Err(EnvdenError::new(
                ErrorCode::NotMember,
                "Uploader not a repaired member",
            ));
        }
        Ok(())
    })?;

    Ok(result.expect("nonempty history"))
}
