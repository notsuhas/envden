use crate::{
    adapters::IAdapters,
    links::approval::repo_of,
    state::{
        lock::with_state_lock,
        repository::{load_state, save_state},
    },
    sync::local::{
        applied::{applied_files, mark_applied_entry},
        conflicts::{backup, conflict_records, save_conflicts},
        files::{base_path, write_bytes},
        reconciliation::operation::deletion::{read_deletion, request_deletion, suffix},
    },
};
use envden_core::{
    adapters::{TPlacementMode, TPlacementState},
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol as p;
use serde_json::{Value, json};
use std::path::Path;

pub fn remove_file(
    adapters: &IAdapters,
    path: &Path,
    yes: bool,
    interactive: bool,
    report: &dyn Fn(&str),
) -> Result<Value> {
    let now = (adapters.now)();
    with_state_lock(&adapters.home, &adapters.now, || {
        let mut state = load_state(&adapters.home)?.unwrap_or(Value::Null);
        let selected = state["links"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|l| {
                l["localOnly"] != true
                    && Path::new(l["root"].as_str().unwrap_or_default())
                        .join(l["path"].as_str().unwrap_or_default())
                        == path
            })
            .cloned()
            .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Env file is not tracked"))?;
        if !yes {
            if !interactive {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidInput,
                    "Non-interactive rm requires --yes",
                ));
            }
            if !crate::output::prompts::consent(
                "Remove this env file everywhere and discard local edits and conflicts? All local content will be backed up.",
                true,
            )? {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidInput,
                    "Removal cancelled",
                ));
            }
        }
        let store = selected["store"].as_str().unwrap_or_default();
        let (targets, skipped, blocked) = selection::select_targets(adapters, &state, store)?;
        if blocked {
            return Ok(
                json!({"kind":"blocked","path":selected["path"],"preserved":[],"backups":[],"publish":"none","skipped":skipped}),
            );
        }
        let records = conflict_records(&adapters.home)?;
        let mut paths = vec![Path::new(store).to_owned()];
        for target in &targets {
            let root = target["root"].as_str().unwrap_or_default();
            let destination = Path::new(root).join(target["path"].as_str().unwrap_or_default());
            if target["mode"] == "copy"
                || adapters
                    .placement(TPlacementMode::Link, Path::new(root))
                    .inspect(store, &destination.to_string_lossy())?
                    == TPlacementState::Detached
            {
                paths.push(destination);
            }
        }
        for record in records.iter().filter(|r| r.store == store) {
            paths.extend(
                [&record.file, &record.mine, &record.server, &record.remote]
                    .into_iter()
                    .chain(record.alternatives.iter())
                    .map(|p| Path::new(p).to_owned()),
            );
        }
        let mut backups = Vec::new();
        let mut preserved = Vec::new();
        for source in paths {
            if let Some(saved) = backup(&adapters.home, &source, now)? {
                report(&format!("Saved {}: {}", source.display(), saved.display()));
                preserved.push(saved.clone());
                backups.push(json!({"source":source,"path":saved}));
            }
        }
        request_deletion(&adapters.home, store, false, None, None, now)?;
        write_bytes(
            &suffix(&base_path(&adapters.home, store, None), ".pending"),
            None,
            now,
        )?;
        let mut target_paths = Vec::new();
        for target in &targets {
            let root = target["root"].as_str().unwrap_or_default();
            let destination = Path::new(root).join(target["path"].as_str().unwrap_or_default());
            let mode = if target["mode"] == "copy" {
                TPlacementMode::Copy
            } else {
                TPlacementMode::Link
            };
            adapters
                .placement(mode, Path::new(root))
                .remove(Some(store), &destination.to_string_lossy())?;
            if mode == TPlacementMode::Copy {
                write_bytes(&base_path(&adapters.home, store, Some(root)), None, now)?;
            }
            target_paths.push(destination.to_string_lossy().into_owned());
        }
        write_bytes(Path::new(store), None, now)?;
        crate::links::checkout::bases::remove_checkout_bases(&adapters.home, &targets, &[], now)?;
        let mut entry = records
            .iter()
            .find(|r| r.store == store)
            .and_then(|r| r.entry.clone());
        if entry.is_none() {
            let root = selected["root"].as_str().unwrap_or_default();
            if let Some(approved) = state["approved"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|a| a["root"] == root)
                && let Some(key) = adapters
                    .keychain
                    .get(&format!("envden/{}/id-key", adapters.home.display()), false)?
            {
                let id = p::file_id(
                    &p::fixed(&key)?,
                    repo_of(&state, approved["repoId"].as_str().unwrap_or_default()),
                    selected["path"].as_str().unwrap_or_default(),
                )?;
                entry = applied_files(&adapters.home)?
                    .get(&p::base32(&id))
                    .and_then(Value::as_str)
                    .map(str::to_owned);
            }
        }
        request_deletion(
            &adapters.home,
            store,
            true,
            entry.as_deref(),
            Some(target_paths),
            now,
        )?;
        let published = read_deletion(&adapters.home, store, now)?.is_some();
        if !published {
            state["links"]
                .as_array_mut()
                .unwrap()
                .retain(|l| l["store"] != store || l["localOnly"] == true);
            save_state(&adapters.home, &state, &|| now)?;
        }
        for record in records.iter().filter(|r| r.store == store) {
            if let Some(entry) = &record.entry {
                mark_applied_entry(&adapters.home, entry, Some(store), now)?;
            }
        }
        save_conflicts(
            &adapters.home,
            &records
                .into_iter()
                .filter(|r| r.store != store)
                .collect::<Vec<_>>(),
            now,
        )?;
        Ok(
            json!({"kind":"removed","path":selected["path"],"preserved":preserved,"backups":backups,"publish":if published{"next-push"}else{"none"},"skipped":skipped}),
        )
    })
}

mod selection;
