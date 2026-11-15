use super::{
    descent::{entry_descent, header_descent},
    files::{changed_files, checked_files},
    signature::check_header_signature,
    source::{IChainSource, ICheckpoint, needed, source_value},
    stored::index_headers,
};
use crate::{
    chain::{devices::apply, swaps::operation_requirement},
    protocol::*,
};
use envden_core::errors::{ErrorCode, Result};
use std::collections::BTreeSet;

pub enum TManifestResult {
    Accepted {
        checkpoint: Box<ICheckpoint>,
        headers: Vec<ISigned<IManifestHeader>>,
        repairs: Vec<IFileEntry>,
        no_fast_forward: BTreeSet<[u8; 32]>,
    },
    Unchanged,
    Rollback,
    Fork,
    Invalid,
}

pub fn accept_manifest(
    c: &ICheckpoint,
    head: &ISigned<IManifestHeader>,
    stored_headers: &[ISigned<IManifestHeader>],
    source: &impl IChainSource,
    local_ids: &BTreeSet<[u8; 32]>,
) -> Result<TManifestResult> {
    match accept(c, head, stored_headers, source, local_ids) {
        Err(e) if e.code == ErrorCode::InvalidData => Ok(TManifestResult::Invalid),
        Err(mut e) if e.code == ErrorCode::Internal && e.message == "Chain source failed" => {
            Err(*e
                .source
                .take()
                .expect("source error")
                .downcast::<envden_core::errors::EnvdenError>()
                .expect("typed source"))
        }
        r => r,
    }
}

fn accept(
    c: &ICheckpoint,
    head: &ISigned<IManifestHeader>,
    stored_headers: &[ISigned<IManifestHeader>],
    source: &impl IChainSource,
    local_ids: &BTreeSet<[u8; 32]>,
) -> Result<TManifestResult> {
    let by_seq = index_headers(stored_headers);
    if head.body.seq <= c.header.body.seq {
        if by_seq.get(&head.body.seq).is_none_or(|stored| {
            object_hash(stored, "manifest").ok() != object_hash(head, "manifest").ok()
        }) {
            check_header_signature(source, &c.state, head)?;
            return Ok(TManifestResult::Fork);
        }
        return Ok(if head.body.seq == c.header.body.seq {
            TManifestResult::Unchanged
        } else {
            TManifestResult::Rollback
        });
    }
    let Some(headers) = header_descent(source, &c.header, head, &c.state)? else {
        return Ok(TManifestResult::Fork);
    };
    let mut state = c.state.clone();
    let mut previous = c.header.clone();
    let mut known: BTreeSet<_> = stored_headers
        .iter()
        .map(|h| object_hash(h, "manifest"))
        .collect::<Result<_>>()?;
    known.insert(object_hash(&c.header, "manifest")?);
    let mut repairs = vec![];
    let mut no_fast_forward = BTreeSet::new();
    checked_files(Some(&c.files), &c.header.body.files_hash)?;
    for signed in &headers {
        let h = &signed.body;
        require_value(h.vault_id == state.vault_id, "Invalid chain data")?;
        if let Some(stored) = by_seq.get(&h.seq)
            && object_hash(stored, "manifest")? != object_hash(signed, "manifest")?
        {
            check_header_signature(source, &state, signed)?;
            return Ok(TManifestResult::Fork);
        }
        let entries = entry_descent(source, state.seq, &state.head, h)?;
        let before = state.clone();
        for e in &entries {
            state = apply(Some(&state), e)?;
        }
        require_value(
            state
                .devices
                .get(&h.signer)
                .is_some_and(|s| verify_object(signed, &s.obj_pub, "manifest")),
            "Invalid chain data",
        )?;
        operation_requirement(&previous.body, h, &entries, &before, false)?;
        require_value(h.epoch == state.epoch, "Invalid chain data")?;
        for e in &entries {
            if let TEntryPayload::RepairDone(p) = &e.body.change {
                require_value(known.contains(&p.restored_head), "Invalid chain data")?;
            }
        }
        let changes = repair_changes(c, &previous, signed, source)?;
        for e in &changes {
            if local_ids.contains(&e.file_id) {
                no_fast_forward.insert(e.file_id);
            }
        }
        repairs.extend(changes);
        known.insert(object_hash(signed, "manifest")?);
        previous = signed.clone();
    }
    let files = checked_files(
        source_value(source.files(&head.body.files_hash))?.as_ref(),
        &head.body.files_hash,
    )?;
    changed_files(&c.files, &files, c.header.body.epoch, head.body.epoch, None)?;
    if head.body.epoch != c.header.body.epoch {
        let boxed = needed(source_value(source.keyring(&head.body.keyring_hash))?)?;
        let key = needed(source_value(source.epoch_key(head.body.epoch))?)?;
        require_value(
            h("keyring-blob", &boxed) == head.body.keyring_hash,
            "Invalid chain data",
        )?;
        open_keyring(
            &boxed,
            &key,
            &state.vault_id,
            state.epoch,
            &state.commits,
            Some(&c.id_key),
        )?;
    }
    Ok(TManifestResult::Accepted {
        checkpoint: Box::new(ICheckpoint {
            header: head.clone(),
            files,
            state,
            id_key: c.id_key,
        }),
        headers,
        repairs,
        no_fast_forward,
    })
}

fn repair_changes(
    c: &ICheckpoint,
    previous: &ISigned<IManifestHeader>,
    signed: &ISigned<IManifestHeader>,
    source: &impl IChainSource,
) -> Result<Vec<IFileEntry>> {
    let h = &signed.body;
    if [1, 11].contains(&h.op) {
        let old = if previous.body.files_hash == c.header.body.files_hash {
            Some(c.files.clone())
        } else {
            source_value(source.files(&previous.body.files_hash))?
        };
        let next = source_value(source.files(&h.files_hash))?;
        if h.op == 11 || (old.is_some() && next.is_some()) {
            let changes = changed_files(
                &checked_files(old.as_ref(), &previous.body.files_hash)?,
                &checked_files(next.as_ref(), &h.files_hash)?,
                previous.body.epoch,
                h.epoch,
                Some(h.op),
            )?;
            if h.op == 11 {
                return Ok(changes);
            }
        }
    }
    Ok(vec![])
}
