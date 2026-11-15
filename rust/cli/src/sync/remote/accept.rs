use super::{
    context::ISyncContext,
    repairs::{pending_repairs, save_pending_repairs},
    source::IRemoteSource,
};
use crate::{
    client::{binary, decode_history_header, text},
    state::files::atomic_write,
    vault::{
        history::{ILocalHistory, IVaultHistory, read_history},
        join::decode_verified_state,
    },
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};
use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
};

pub struct IAcceptedHead {
    pub repairs: Vec<p::IFileEntry>,
    pub no_fast_forward: Vec<String>,
}

pub fn local_history(context: &ISyncContext<'_>) -> Result<ILocalHistory> {
    let strings = |key: &str| {
        context.state[key]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect()
    };
    Ok(ILocalHistory {
        entries: strings("entries"),
        headers: strings("headers"),
        latest: context.state["latest"].as_str().map(str::to_owned),
        verified_state: context
            .state
            .get("verifiedState")
            .map(decode_verified_state)
            .transpose()?,
    })
}

pub fn accept_head(
    context: &mut ISyncContext<'_>,
    history: Option<IVaultHistory>,
    read_only: bool,
) -> Result<IAcceptedHead> {
    let mut pending = pending_repairs(&context.adapters.home)?;
    let (remote, head) = current_head(context, history)?;
    let source = IRemoteSource {
        history: &remote,
        head: &head,
        context,
        files: RefCell::new(BTreeMap::new()),
        keyring: RefCell::new(None),
        keys: RefCell::new(BTreeMap::new()),
    };
    let local_ids: BTreeSet<_> = context
        .checkpoint
        .files
        .entries
        .iter()
        .map(|e| e.file_id)
        .collect();
    let accepted = c::accept_manifest(
        &context.checkpoint,
        &head,
        &context.headers,
        &source,
        &local_ids,
    )?;
    let files = source.files.into_inner();
    let keyring = source.keyring.into_inner();
    let keys = source.keys.into_inner();
    context.keys.extend(keys);
    let (checkpoint, headers, repairs, no_fast_forward) = match accepted {
        c::TManifestResult::Unchanged => {
            return Ok(IAcceptedHead {
                repairs: vec![],
                no_fast_forward: pending,
            });
        }
        c::TManifestResult::Rollback => {
            return Err(EnvdenError::new(
                ErrorCode::Rollback,
                "Server rolled back; run envden server repair",
            ));
        }
        c::TManifestResult::Fork => {
            if let Some(report) = &context.options.report {
                report(&format!(
                    "Local head: {}; server head: {}",
                    text(&p::object_hash(&context.checkpoint.header, "manifest")?),
                    text(&p::object_hash(&head, "manifest")?)
                ));
            }
            return Err(EnvdenError::new(
                ErrorCode::Fork,
                "Server history forked; create a new vault from a trusted device's store",
            ));
        }
        c::TManifestResult::Invalid => {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Invalid manifest history",
            ));
        }
        c::TManifestResult::Accepted {
            checkpoint,
            headers,
            repairs,
            no_fast_forward,
        } => (checkpoint, headers, repairs, no_fast_forward),
    };
    context.checkpoint = *checkpoint;
    let mut by_seq: BTreeMap<_, _> = context
        .headers
        .iter()
        .map(|h| (h.body.seq, h.clone()))
        .collect();
    for header in headers {
        by_seq.insert(header.body.seq, header);
    }
    context.headers = by_seq.into_values().collect();
    context.entries = remote
        .entries
        .into_iter()
        .filter(|e| e.body.seq <= head.body.list_seq)
        .collect();
    if let Some(keyring) = keyring {
        let key = context
            .keys
            .get(&head.body.epoch)
            .ok_or_else(|| EnvdenError::new(ErrorCode::Locked, "Epoch key unavailable"))?;
        let ring = p::open_keyring(
            &keyring,
            key,
            &context.vault_id,
            head.body.epoch,
            &context.checkpoint.state.commits,
            Some(&context.checkpoint.id_key),
        )?;
        if !read_only {
            context.adapters.keychain.set(
                &format!(
                    "envden/{}/epoch/{}",
                    context.adapters.home.display(),
                    head.body.epoch
                ),
                key,
            )?;
        }
        for older in ring.older {
            context.keys.insert(older.epoch, older.key);
        }
        context.state["keyring"] = text(&keyring).into();
    }
    if read_only {
        return Ok(IAcceptedHead {
            repairs,
            no_fast_forward: pending,
        });
    }
    for (hash, files) in files {
        atomic_write(
            &context.adapters.home.join("state/file-lists").join(hash),
            &p::encode(&files)?,
            (context.options.now)(),
        )?;
    }
    for id in no_fast_forward {
        let id = p::base32(&id);
        if !pending.contains(&id) {
            pending.push(id);
        }
    }
    save_pending_repairs(&context.adapters.home, &pending, (context.options.now)())?;
    Ok(IAcceptedHead {
        repairs,
        no_fast_forward: pending,
    })
}

fn current_head(
    context: &ISyncContext<'_>,
    history: Option<IVaultHistory>,
) -> Result<(IVaultHistory, p::ISigned<p::IManifestHeader>)> {
    let raw = context.client.request("/v1/head", "GET", None)?.body;
    let local = local_history(context)?;
    let remote = match history {
        Some(history) => history,
        None => read_history(&context.client, &context.vault_id, Some(&local))?,
    };
    if let Some(head) = remote
        .headers
        .iter()
        .find(|h| p::encode(*h).is_ok_and(|bytes| bytes == raw))
        .cloned()
    {
        return Ok((remote, head));
    }
    let remote = read_history(&context.client, &context.vault_id, Some(&local))?;
    let stored = local
        .headers
        .iter()
        .map(|h| binary(h))
        .collect::<Result<Vec<_>>>()?;
    let head = decode_history_header(
        &raw,
        &remote.entries,
        &stored,
        local.latest.as_deref().unwrap_or(crate::version::VERSION),
        Some(&remote.states),
    )?;
    Ok((remote, head))
}
