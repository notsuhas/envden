use super::gate::{TRestoreGate, restore_gate};
use crate::{
    adapters::IAdapters,
    client::ITransport,
    history::{
        files::select::{history_targets, selection_directory},
        list::changes::version_changes,
        list::run::changes_json,
        versions::retained::retained,
    },
    sync::{
        local::{
            conflicts::{backup, conflict_records},
            files::write_bytes,
            selection::selected_repos,
        },
        remote::context::ISyncOptions,
    },
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Value, json};
use std::{collections::HashSet, path::Path, rc::Rc};

pub fn restore(
    adapters: &IAdapters,
    options: ISyncOptions,
    transport: Rc<dyn ITransport>,
    file: &str,
    version: u64,
) -> Result<Value> {
    let gate = restore_gate(
        options.yes,
        options.interactive,
        crate::settings::read_config(&adapters.home)?["agent-merge"] == true,
    );
    if let TRestoreGate::Refused(message) = gate {
        return Err(EnvdenError::new(ErrorCode::InvalidInput, message));
    }
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
            &selection_directory(&cwd, Some(file)),
            false,
            &mut HashSet::new(),
            &|_| {},
        )?;
        let targets = history_targets(&state, &repos, &cwd, Some(file), false)?;
        let target = &targets[0];
        let managed = target.link.as_ref();
        let store = managed
            .and_then(|l| l["store"].as_str())
            .unwrap_or_default();
        let current = if managed.is_some() {
            Some(crate::history::files::current::checkout_bytes(
                adapters, target,
            )?)
        } else {
            None
        };
        let detached = current.as_ref().is_some_and(|c| c.detached);
        let conflicted = conflict_records(&adapters.home)?
            .iter()
            .any(|r| r.store == store);
        if let Some(error) = super::refusal::restore_refusal(
            managed.is_some(),
            managed.is_some_and(|l| l["localOnly"] == true),
            detached,
            conflicted,
        ) {
            return Err(error);
        }
        let link = managed.unwrap();
        let path = Path::new(&target.root).join(&target.path);
        let destination = if link["mode"] == "link" {
            Path::new(store).to_owned()
        } else {
            path.clone()
        };
        let bytes = current.and_then(|c| c.bytes);
        let context = crate::history::versions::source::history_source(
            adapters,
            options.now.clone(),
            transport,
        )?;
        let id = p::file_id(&context.id_key, &target.repo_id, &target.path)?;
        let (versions, _) = retained(&context, &[id])?
            .remove(&p::base32(&id))
            .unwrap_or_default();
        let chosen = versions
            .iter()
            .find(|v| v.entry.version == version)
            .ok_or_else(|| {
                EnvdenError::new(ErrorCode::NotFound, "Version is not retained on the server")
            })?;
        let content = chosen.content.as_deref().ok_or_else(|| {
            EnvdenError::new(
                ErrorCode::InvalidInput,
                "That version deleted the file; choose one with content",
            )
        })?;
        let changes = changes_json(&version_changes(&[Some(content), bytes.as_deref()], true)[0]);
        let mut result =
            json!({"kind":"unchanged","path":path,"version":version,"changes":changes});
        if bytes.as_deref() == Some(content) {
            return Ok(result);
        }
        if gate == TRestoreGate::Confirm
            && !confirm_restore(&path, version, &changes, crate::output::prompts::consent)?
        {
            result["kind"] = "cancelled".into();
            return Ok(result);
        }
        let saved = backup(&adapters.home, &destination, (adapters.now)())?;
        write_bytes(&destination, Some(content), (adapters.now)())?;
        result["kind"] = "restored".into();
        if let Some(saved) = saved {
            result["backup"] = json!(saved);
        }
        Ok(result)
    })
}

fn confirm_restore(
    path: &Path,
    version: u64,
    changes: &Value,
    confirm: impl FnOnce(&str, bool) -> Result<bool>,
) -> Result<bool> {
    confirm(
        &format!(
            "Restore {} to version {version}? {}",
            path.display(),
            crate::history::list::render::changes_text(changes)
        ),
        false,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_confirmation_defaults_to_declining() {
        let confirmed = confirm_restore(Path::new(".env"), 3, &json!({}), |message, initial| {
            assert!(message.starts_with("Restore .env to version 3?"));
            assert!(!initial);
            Ok(initial)
        })
        .unwrap();
        assert!(!confirmed);
    }
}
