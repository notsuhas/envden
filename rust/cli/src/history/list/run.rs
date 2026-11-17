use super::changes::{TKeyChanges, version_changes, version_kind};
use crate::{
    adapters::IAdapters,
    client::ITransport,
    history::{files::select::history_targets, versions::retained::retained},
    sync::{local::selection::selected_repos, remote::context::ISyncOptions},
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use serde_json::{Value, json};
use std::{collections::HashSet, rc::Rc};

pub fn file_history(
    adapters: &IAdapters,
    options: ISyncOptions,
    transport: Rc<dyn ITransport>,
    file: Option<&str>,
) -> Result<Value> {
    crate::state::lock::with_state_lock(&adapters.home, &*options.now.clone(), || {
        let mut state = crate::state::require_configured(crate::state::repository::load_state(
            &adapters.home,
        )?)?;
        let cwd = options
            .cwd
            .clone()
            .unwrap_or_else(|| adapters.user_home.clone());
        let repos = selected_repos(
            adapters,
            &mut state,
            &crate::history::files::select::selection_directory(&cwd, file),
            options.all,
            &mut HashSet::new(),
            &|_| {},
        )?;
        let targets = history_targets(&state, &repos, &cwd, file, options.all)?;
        let context = crate::history::versions::source::history_source(
            adapters,
            options.now.clone(),
            transport,
        )?;
        let mut groups: Vec<Vec<crate::history::files::select::IHistoryTarget>> = Vec::new();
        for target in targets {
            if let Some(group) = groups
                .iter_mut()
                .find(|g| g[0].repo_id == target.repo_id && g[0].path == target.path)
            {
                group.push(target);
            } else {
                groups.push(vec![target]);
            }
        }
        let ids = groups
            .iter()
            .map(|group| p::file_id(&context.id_key, &group[0].repo_id, &group[0].path))
            .collect::<Result<Vec<_>>>()?;
        let mut walks = retained(&context, &ids)?;
        let mut files = Vec::new();
        for (group, id) in groups.into_iter().zip(ids) {
            let first = &group[0];
            let (versions, pruned) = walks.remove(&p::base32(&id)).unwrap_or_default();
            let contents: Vec<_> = versions.iter().map(|v| v.content.as_deref()).collect();
            let changes = version_changes(&contents, !pruned);
            let mut records = Vec::new();
            for (version, changes) in versions.iter().zip(changes.iter()) {
                let mut record = json!({"version":version.entry.version,"kind":version_kind(version.entry.state)});
                if let Some(header) = &version.header {
                    let time =
                        chrono::DateTime::from_timestamp_millis(header.body.created_at as i64)
                            .unwrap()
                            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
                    record["time"] = time.into();
                    if let Some(device) = context.history.state.devices.get(&header.body.signer) {
                        record["device"] = device.name.clone().into();
                    } else {
                        record["removedDevice"] = true.into();
                    }
                }
                record["changes"] = changes_json(changes);
                records.push(record);
            }
            let mut checkouts = Vec::new();
            for target in &group {
                let bytes = crate::history::files::current::checkout_bytes(adapters, target)?.bytes;
                let mut checkout = json!({"root":target.root});
                if let Some(version) = versions.iter().find(|v| v.content == bytes) {
                    checkout["version"] = version.entry.version.into();
                }
                checkouts.push(checkout);
            }
            files.push(json!({"repoId":first.repo_id,"path":first.path,"pruned":pruned,"checkouts":checkouts,"versions":records}));
        }
        Ok(json!({"files":files}))
    })
}

pub fn changes_json(changes: &TKeyChanges) -> Value {
    match changes {
        TKeyChanges::Unknown => "unknown".into(),
        TKeyChanges::Unparsed => "unparsed".into(),
        TKeyChanges::Keys(d) => json!({"added":d.added,"changed":d.changed,"removed":d.removed}),
    }
}
