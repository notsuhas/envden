use crate::{
    adapters::IAdapters,
    client::{binary, text},
    links::approval::{checkout_approval, repo_of},
    settings::read_config,
    state::records::read_sync_record,
    sync::local::{
        applied::applied_files,
        conflicts::conflict_records,
        files::{base_path, read_bytes},
        reconciliation::operation::{
            deletion::{decode_deletion, suffix},
            record::decode_operation,
        },
        validation::size::file_size_notice,
    },
};
use envden_core::{
    adapters::{IEnvFileRules, accepts_env_path},
    errors::Result,
};
use envden_protocol::protocol as p;
use serde_json::Value;
use std::{collections::BTreeMap, path::Path};

pub fn held_files(adapters: &IAdapters, state: &Value) -> Result<BTreeMap<String, &'static str>> {
    let invalid_attempt =
        crate::sync::remote::attempt::record::invalid_attempt_state(&adapters.home)?;
    let config = read_config(&adapters.home)?;
    let patterns = |key| {
        config["env-files"][key].as_array().map(|a| {
            a.iter()
                .filter_map(|s| s.as_str().map(str::to_owned))
                .collect()
        })
    };
    let rules = IEnvFileRules {
        include: patterns("include"),
        exclude: patterns("exclude"),
        extra_skipped: patterns("extraSkipped"),
    };
    let conflicts = conflict_records(&adapters.home)?;
    let applied = applied_files(&adapters.home)?;
    let key = adapters
        .keychain
        .get(&format!("envden/{}/id-key", adapters.home.display()), false)?
        .map(|b| p::fixed::<32>(&b))
        .transpose()?;
    let files = state["files"]
        .as_str()
        .map(|v| binary(v).and_then(|b| p::decode::<p::IFiles>(&b)))
        .transpose()?
        .unwrap_or(p::IFiles { entries: vec![] });
    let mut held = BTreeMap::new();
    for link in state["links"].as_array().into_iter().flatten() {
        if link["localOnly"] == true {
            continue;
        }
        let root = link["root"].as_str().unwrap_or_default();
        let path = link["path"].as_str().unwrap_or_default();
        let store = link["store"].as_str().unwrap_or_default();
        let base = base_path(&adapters.home, store, None);
        let entry_path = suffix(&base, ".entry");
        let corrupt = read_sync_record(&entry_path, |s| {
            binary(s).and_then(|b| p::decode::<p::IFileEntry>(&b))
        })
        .is_err()
            || read_sync_record(&suffix(&base, ".pending"), decode_operation).is_err()
            || read_sync_record(&suffix(&base, ".delete"), decode_deletion).is_err()
            || read_bytes(&suffix(&base, ".corrupt"))?.is_some()
            || invalid_attempt;
        let stored = read_bytes(Path::new(store))?;
        let approved = adapters
            .repo
            .checkout_at(root)?
            .is_some_and(|c| checkout_approval(state, &c) == "approved");
        let id = state["approved"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|a| a["root"] == root)
            .zip(key.as_ref())
            .map(|(a, key)| {
                p::file_id(
                    key,
                    repo_of(state, a["repoId"].as_str().unwrap_or_default()),
                    path,
                )
            })
            .transpose()?;
        let entry = id.and_then(|id| files.entries.iter().find(|e| e.file_id == id));
        let unapplied = entry.is_some_and(|e| {
            p::encode(e).is_ok_and(|b| {
                applied.get(&p::base32(&e.file_id)).and_then(Value::as_str)
                    != Some(text(&b).as_str())
            })
        });
        let kind = if corrupt {
            Some("invalid-state")
        } else if file_size_notice(path, stored.as_deref()).is_some() {
            Some("oversized")
        } else if !approved {
            Some("needs-approval")
        } else if !accepts_env_path(path, Some(&rules))? {
            Some("excluded")
        } else if conflicts.iter().any(|r| r.store == store) {
            Some("conflict")
        } else if entry.is_none() && link["mode"] == "link" && stored.is_none() {
            Some("lost")
        } else if read_bytes(&suffix(&base, ".pending"))?.is_some() || unapplied {
            Some("incomplete")
        } else {
            None
        };
        if let Some(kind) = kind {
            held.insert(
                Path::new(root).join(path).to_string_lossy().into_owned(),
                kind,
            );
        }
    }
    Ok(held)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn corrupt_attempt_holds_synced_files_and_skips_local_only() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = crate::adapters::create_adapters(
            Some(dir.path().join("home")),
            dir.path().into(),
            || 1,
        );
        let attempts = adapters.home.join("state/attempts");
        std::fs::create_dir_all(&attempts).unwrap();
        let marker = attempts.join(format!("{}.invalid", "A".repeat(43)));
        std::fs::write(&marker, "unchanged").unwrap();
        let root = dir.path().join("checkout");
        std::fs::create_dir(&root).unwrap();
        let store = adapters.home.join("store/file");
        let state = json!({"links":[
            {"root":root,"path":".env","store":store,"mode":"link","localOnly":false},
            {"root":root,"path":".env.local","store":store,"mode":"link","localOnly":true}
        ]});

        let held = held_files(&adapters, &state).unwrap();

        assert_eq!(held.len(), 1);
        assert_eq!(
            held[&root.join(".env").to_string_lossy().into_owned()],
            "invalid-state"
        );
        assert_eq!(std::fs::read_to_string(&marker).unwrap(), "unchanged");
        assert_eq!(std::fs::read_dir(&attempts).unwrap().count(), 1);
    }
}
