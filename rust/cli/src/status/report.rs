use super::{
    file_state::{IFileFacts, derive_file_state},
    local::local_status,
};
use crate::{
    adapters::IAdapters,
    client::ITransport,
    links::{approval::repo_of, checkout::repo::checkout_repo},
    state::repository::load_state,
    sync::{diff::diff, remote::context::ISyncOptions},
};
use envden_core::{adapters::TPlacementState, errors::Result};
use serde_json::{Value, json};
use std::rc::Rc;

fn options(adapters: &IAdapters) -> ISyncOptions {
    ISyncOptions {
        now: adapters.now,
        cwd: None,
        all: true,
        yes: false,
        interactive: false,
        choose: None,
        confirm: None,
        report: None,
    }
}

pub fn status_report(adapters: &IAdapters, transport: Rc<dyn ITransport>) -> Result<Value> {
    let local = local_status(adapters, false, transport.as_ref())?;
    if local["configured"] != true {
        return Ok(json!({"configured":false,"update":local["update"]}));
    }
    let state = load_state(&adapters.home)?.unwrap();
    let changes = diff(adapters, options(adapters), transport.clone())?;
    let remote = if local["server"] == "reachable" {
        remote_files(adapters, transport).ok()
    } else {
        None
    };
    let mut files = Vec::new();
    for link in local["links"].as_array().into_iter().flatten() {
        let root = link["root"].as_str().unwrap_or_default();
        let path = link["path"].as_str().unwrap_or_default();
        let repo = checkout_repo(&state, root);
        let change = changes
            .iter()
            .find(|c| c["root"] == root && c["path"] == path);
        let placement = match link["status"].as_str() {
            Some("detached") => Some(TPlacementState::Detached),
            Some("missing") => Some(TPlacementState::Missing),
            _ => None,
        };
        let file_state = derive_file_state(&IFileFacts {
            local_only: link["localOnly"] == true,
            conflict: link["conflict"] == true,
            placement,
            held_back: false,
            changed: change.is_some_and(|c| c["differs"] == true),
            remote: remote.as_ref().is_some_and(|r| {
                r.iter()
                    .any(|(id, p)| Some(id.as_str()) == repo && p == path)
            }),
        });
        let mut record = json!({"root":root,"path":path,"state":file_state});
        if let Some(repo) = repo {
            record["repoId"] = repo.into();
        }
        if let Some(change) = change.filter(|c| c["differs"] == true && c["kind"] == "diff") {
            record["keys"] = json!({"added":change["added"],"removed":change["removed"],"changed":change["changed"]});
        }
        files.push(record);
    }
    for approved in state["approved"].as_array().into_iter().flatten() {
        let repo = repo_of(&state, approved["repoId"].as_str().unwrap_or_default());
        for (id, path) in remote.iter().flatten() {
            if id != repo
                || state["links"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .any(|l| l["root"] == approved["root"] && l["path"] == *path)
            {
                continue;
            }
            files.push(json!({"root":approved["root"],"path":path,"repoId":repo,"state":"remote"}));
        }
    }
    let mut result = json!({"configured":true,"vaultId":local["vaultId"],"server":local["server"]});
    if let Some(reason) = local.get("serverReason") {
        result["serverReason"] = reason.clone();
    }
    result["serverChecked"] = remote.is_some().into();
    result["files"] = files.into();
    result["update"] = local["update"].clone();
    Ok(result)
}

fn remote_files(
    adapters: &IAdapters,
    transport: Rc<dyn ITransport>,
) -> Result<Vec<(String, String)>> {
    Ok(
        crate::notice::fetch::remote_notice(adapters, options(adapters), transport)?
            .files
            .into_iter()
            .map(|name| (name.repo_id, name.path))
            .collect(),
    )
}
