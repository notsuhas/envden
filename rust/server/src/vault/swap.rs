use super::{material::stored_swap, vault_chain};
use crate::{auth::session_key, http::types::IAppOptions, middleware::IAuth};
use envden_core::{
    adapters::storage::*,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::{
    chain::{ISwapContext, TSwapResult, validate_swap},
    protocol::*,
};
use std::collections::BTreeSet;

pub(crate) fn commit_swap(
    options: &IAppOptions,
    auth: &IAuth,
    swap: &ISwap,
    digest: &[u8],
    mailbox: Option<u64>,
) -> Result<TCommitResult> {
    let storage = options.storage.as_ref();
    let id = &auth.request.vault_id;
    let mut result = None;
    storage.transaction(&mut || {
        let head = storage
            .head(id)?
            .ok_or_else(|| EnvdenError::new(ErrorCode::Moving, "Import required"))?;
        if storage.find_committed(id, digest)? {
            result = Some(TCommitResult::RetryOfCommitted);
            return Ok(());
        }
        let vault = storage
            .vault(id)?
            .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Unknown vault"))?;
        if vault.server_moved.is_some()
            || ((vault.frozen || !vault.active) && swap.header.body.op != 10)
        {
            return Err(EnvdenError::new(ErrorCode::Moving, "Vault moving"));
        }
        if head.as_slice() != swap.expected_head {
            result = Some(TCommitResult::HeadMoved { head: Some(head) });
            return Ok(());
        }
        let (previous, state) = vault_chain(storage, id)?;
        let files: IFiles = decode(
            &storage
                .file_list(id, &previous.body.files_hash)?
                .ok_or_else(|| {
                    EnvdenError::new(ErrorCode::InvalidData, "Missing head file list")
                })?,
        )?;
        let old: BTreeSet<_> = files
            .entries
            .iter()
            .filter(|e| matches!(e.state, 1 | 3))
            .map(|e| e.blob_hash)
            .collect();
        let mut available = BTreeSet::new();
        for entry in
            swap.files
                .iter()
                .flat_map(|f| f.entries.iter())
                .chain(if swap.header.body.op == 11 {
                    files.entries.as_slice()
                } else {
                    &[]
                })
        {
            if storage.has_blob(id, &entry.blob_hash)? {
                available.insert(entry.blob_hash);
            }
        }
        let mut ancestors = BTreeSet::new();
        for entry in &swap.entries {
            if let TEntryPayload::RepairDone(done) = &entry.body.change
                && storage.header(id, &done.restored_head)?.is_some()
            {
                ancestors.insert(done.restored_head);
            }
        }
        let context = ISwapContext {
            previous,
            state,
            files: files.clone(),
            request_signer: auth.request.device,
            missing_blobs: files
                .entries
                .iter()
                .filter(|e| !available.contains(&e.blob_hash))
                .map(|e| e.blob_hash)
                .collect(),
            destination_pin: if vault.active {
                None
            } else {
                Some(server_pin(&options.server_keys.public_key)?)
            },
            ancestor_header_hashes: ancestors,
            repair_registration_required: envden_protocol::chain::repair_login_decision(
                &crate::repair::repair_history(options, id)?,
            ) == "register",
        };
        let TSwapResult::Valid {
            authorization,
            state,
        } = validate_swap(swap, &context)?
        else {
            return Err(EnvdenError::new(ErrorCode::InvalidData, "Invalid swap"));
        };
        if vault.restored.is_some() && !matches!(swap.header.body.op, 4 | 11 | 12) {
            return Err(EnvdenError::new(ErrorCode::RestoredMode, "Repair required"));
        }
        let mut stored = stored_swap(swap, digest)?;
        super::authorization::authorize(options, auth, swap, authorization, &mut stored, mailbox)?;
        if swap.files.as_ref().is_some_and(|f| {
            f.entries.iter().any(|e| {
                matches!(e.state, 1 | 3)
                    && !old.contains(&e.blob_hash)
                    && !available.contains(&e.blob_hash)
            })
        }) {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Missing uploaded blob",
            ));
        }
        if let Some(record) = &swap.opaque_record {
            let key = session_key(auth, "registration-record");
            if storage.session(id, &key, (options.now)())?.as_ref() != Some(record) {
                return Err(EnvdenError::new(
                    ErrorCode::Unauthorized,
                    "Staged registration required",
                ));
            }
            stored.consume_sessions.get_or_insert_default().push(key);
        }
        if swap.sk_pub.is_some() {
            let mut vault = vault.clone();
            vault.sk_refused = false;
            stored.vault = Some(vault);
        }
        if swap.header.body.op == 12 {
            crate::repair::close_repair(options, auth, swap, &mut stored)?;
        }
        let destination = state.server_pin;
        crate::moving::prepare_move(options, auth, swap, &mut stored, &destination)?;
        let committed =
            storage.commit_swap(id, Some(&swap.expected_head), &stored, (options.now)())?;
        if matches!(committed, TCommitResult::Committed)
            && swap.opaque_record.is_some()
            && let Some(receipt) = storage.consume_session(
                id,
                &session_key(auth, "registration-receipt"),
                (options.now)(),
            )?
        {
            storage.refund(&String::from_utf8_lossy(&receipt), (options.now)())?;
        }
        result = Some(committed);

        Ok(())
    })?;

    Ok(result.expect("transaction result"))
}
