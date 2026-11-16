use super::{
    reasons::{IFacts, reason_for},
    records::invalid_record,
};
use crate::{
    adapters::IAdapters,
    client::{binary, text},
    links::approval::{checkout_approval, repo_of},
    state::repository::load_state,
    sync::{
        local::{
            applied::applied_files,
            conflicts::conflict_records,
            files::{base_path, read_bytes},
            reconciliation::operation::{
                deletion::{decode_deletion, suffix},
                record::decode_operation,
            },
            validation::{rules::env_rules, size::file_size_notice},
        },
        remote::attempt::record::invalid_attempt_state,
    },
};
use envden_core::{adapters::accepts_env_path, errors::Result};
use envden_protocol::protocol as p;
use serde_json::Value;
use std::path::Path;

pub(crate) struct IHeldBack {
    pub path: String,
    pub kind: &'static str,
}

pub(crate) fn held_back_files(adapters: &IAdapters) -> Result<Vec<IHeldBack>> {
    let Some(state) = load_state(&adapters.home)? else {
        return Ok(vec![]);
    };
    let invalid_attempt = invalid_attempt_state(&adapters.home)?;
    let rules = env_rules(&adapters.home)?;
    let conflicts = conflict_records(&adapters.home)?;
    let applied = applied_files(&adapters.home)?;
    let key = adapters
        .keychain
        .get(&format!("envden/{}/id-key", adapters.home.display()), false)?
        .map(|key| p::fixed::<32>(&key))
        .transpose()?;
    let entries = state["files"]
        .as_str()
        .map(|files| binary(files).and_then(|bytes| p::decode::<p::IFiles>(&bytes)))
        .transpose()?
        .unwrap_or(p::IFiles { entries: vec![] });
    let mut notices = Vec::new();
    for link in state["links"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|link| link["localOnly"] != true)
    {
        let root = link["root"].as_str().unwrap_or_default();
        let path = link["path"].as_str().unwrap_or_default();
        let store = link["store"].as_str().unwrap_or_default();
        let id = state["approved"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|approved| approved["root"] == root)
            .zip(key.as_ref())
            .map(|(approved, key)| {
                p::file_id(
                    key,
                    repo_of(&state, approved["repoId"].as_str().unwrap_or_default()),
                    path,
                )
            })
            .transpose()?;
        let entry = id.and_then(|id| entries.entries.iter().find(|entry| entry.file_id == id));
        let stored = read_bytes(Path::new(store))?;
        let base = base_path(&adapters.home, store, None);
        let invalid_entry = invalid_record(&suffix(&base, ".entry"), |saved| {
            binary(saved).and_then(|bytes| p::decode::<p::IFileEntry>(&bytes))
        })?;
        let invalid_pending = invalid_record(&suffix(&base, ".pending"), decode_operation)?;
        let invalid_deletion = invalid_record(&suffix(&base, ".delete"), decode_deletion)?;
        let marker = read_bytes(&suffix(&base, ".corrupt"))?.is_some();
        let kind =
            if invalid_attempt || invalid_entry || invalid_pending || invalid_deletion || marker {
                Some("invalid-state")
            } else {
                let oversized = file_size_notice(path, stored.as_deref()).is_some();
                let approval = adapters
                    .repo
                    .checkout_at(root)?
                    .is_some_and(|checkout| checkout_approval(&state, &checkout) == "approved");
                let included = accepts_env_path(path, Some(&rules));
                let conflict = conflicts.iter().any(|record| record.store == store);
                let pending = read_bytes(&suffix(&base, ".pending"))?.is_some();
                let unapplied = entry
                    .map(|entry| {
                        p::encode(entry).map(|bytes| {
                            applied
                                .get(&p::base32(&entry.file_id))
                                .and_then(Value::as_str)
                                != Some(text(&bytes).as_str())
                        })
                    })
                    .transpose()?
                    .unwrap_or(false);
                let lost = entry.is_none() && link["mode"] == "link" && stored.is_none();
                reason_for(IFacts {
                    oversized,
                    approval,
                    included,
                    conflict,
                    pending,
                    unapplied,
                    lost,
                })
            };
        if let Some(kind) = kind {
            notices.push(IHeldBack {
                path: Path::new(root).join(path).to_string_lossy().into_owned(),
                kind,
            });
        }
    }
    Ok(notices)
}
