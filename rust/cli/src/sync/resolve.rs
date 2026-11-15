use super::{
    local::{
        applied::mark_applied_entry,
        conflicts::{backup, conflict_records, save_conflicts},
        files::{base_path, read_bytes, write_bytes},
        reconciliation::operation::deletion::{request_deletion, suffix},
    },
    resolution::{resolution_bytes, select_conflicts},
};
use crate::{
    adapters::IAdapters,
    links::checkout::placement::place_file,
    state::{
        lock::with_state_lock,
        repository::{load_state, save_state},
    },
};
use envden_core::{
    adapters::{TPlacementMode, TPlacementState},
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::{Value, json};
use std::path::Path;

pub fn resolve_conflict(
    adapters: &IAdapters,
    file: Option<&str>,
    repo: Option<&Path>,
    choice: &str,
    cwd: &Path,
) -> Result<Value> {
    let now = (adapters.now)();
    with_state_lock(&adapters.home, now, || {
        let mut records = conflict_records(&adapters.home)?;
        let matches = select_conflicts(&records, repo, file, cwd);
        if matches.len() != 1 {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Name exactly one conflict file",
            ));
        }
        let record = matches[0].clone();
        let server = if record.deleted {
            None
        } else {
            read_bytes(Path::new(&record.server))?
        };
        let bytes = resolution_bytes(choice, &record, server)?;
        let mut preserved = Vec::new();
        let mut backups = Vec::new();
        for path in [&record.mine, &record.server, &record.remote]
            .into_iter()
            .chain(record.alternatives.iter())
            .chain([&record.store])
        {
            if let Some(saved) = backup(&adapters.home, Path::new(path), now)? {
                preserved.push(saved.clone());
                backups.push(json!({"source":path,"path":saved}));
            }
        }
        request_deletion(
            &adapters.home,
            &record.store,
            bytes.is_none() && (record.deleted || record.mine_deleted),
            record.entry.as_deref(),
            Some(
                record
                    .targets
                    .iter()
                    .map(|t| {
                        Path::new(&t.root)
                            .join(&t.path)
                            .to_string_lossy()
                            .into_owned()
                    })
                    .collect(),
            ),
            now,
        )?;
        let base = base_path(&adapters.home, &record.store, None);
        for end in [".pending", ".corrupt"] {
            write_bytes(&suffix(&base, end), None, now)?;
        }
        write_bytes(Path::new(&record.store), bytes.as_deref(), now)?;
        let mut state = load_state(&adapters.home)?.ok_or_else(|| {
            EnvdenError::new(ErrorCode::NotFound, "Local sync state is unavailable")
        })?;
        for target in &record.targets {
            let mode = if target.mode == "copy" {
                TPlacementMode::Copy
            } else {
                TPlacementMode::Link
            };
            let placement = adapters.placement(mode, Path::new(&target.root));
            let destination = Path::new(&target.root)
                .join(&target.path)
                .to_string_lossy()
                .into_owned();
            if bytes.is_some() {
                if mode == TPlacementMode::Copy
                    || placement.inspect(&record.store, &destination)? != TPlacementState::Linked
                {
                    place_file(
                        adapters,
                        placement.as_ref(),
                        &target.root,
                        &record.store,
                        &destination,
                        None,
                    )?;
                }
                if !state["links"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .any(|l| l["root"] == target.root && l["path"] == target.path)
                {
                    state["links"]
                        .as_array_mut()
                        .unwrap()
                        .push(serde_json::to_value(target).unwrap());
                }
            } else {
                placement.remove(Some(&record.store), &destination)?;
            }
            write_bytes(
                &base_path(
                    &adapters.home,
                    &record.store,
                    if mode == TPlacementMode::Copy {
                        Some(&target.root)
                    } else {
                        None
                    },
                ),
                bytes.as_deref(),
                now,
            )?;
        }
        save_state(&adapters.home, &state, now)?;
        if let Some(entry) = &record.entry {
            write_bytes(Path::new(&record.base), bytes.as_deref(), now)?;
            mark_applied_entry(&adapters.home, entry, Some(&record.store), now)?;
        }
        records.retain(|r| r.base != record.base);
        save_conflicts(&adapters.home, &records, now)?;
        for path in [&record.file, &record.server, &record.remote, &record.mine]
            .into_iter()
            .chain(record.alternatives.iter())
        {
            write_bytes(Path::new(path), None, now)?;
        }
        Ok(
            json!({"kind":"resolved","path":record.path,"preserved":preserved,"placementReports":[],"backups":adapters.home.join("conflicts/backups"),"savedBackups":backups}),
        )
    })
}
