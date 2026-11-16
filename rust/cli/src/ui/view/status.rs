use super::{
    files::{IFileFacts, file_status, group_repos, pending_count},
    unlock::derive_unlock,
};
use crate::{
    adapters::IAdapters,
    client::ITransport,
    links::{approval::checkout_approval, checkout::repo::checkout_repo},
    notice::remote::read_remote_notice,
    state::repository::load_state,
    sync::{
        diff::diff,
        local::{conflicts::conflict_records, files::read_bytes},
    },
    ui::routes::api::options,
};
use envden_core::{
    errors::{ErrorCode, Result},
    merge::diff_env_keys,
};
use serde_json::{Value, json};
use std::{path::Path, rc::Rc};

pub fn dashboard_status(adapters: &IAdapters, transport: Rc<dyn ITransport>) -> Result<Value> {
    let Some(before) =
        load_state(&adapters.home)?.filter(super::configuration::configured_snapshot)
    else {
        return Ok(json!({"kind":"not-configured"}));
    };
    drop(before);
    let diffs = diff(adapters, options(adapters), transport.clone())?;
    let local = crate::status::local::local_status(adapters, false, transport.as_ref())?;
    let Some(state) = load_state(&adapters.home)?
        .filter(|state| super::configuration::configured_local(state, &local))
    else {
        return Ok(json!({"kind":"not-configured"}));
    };
    let held = super::held::held_files(adapters, &state)?;
    let remote = read_remote_notice(&adapters.home)?
        .map(|r| r.repos)
        .unwrap_or_default();
    let approvals = checkout_approvals(&state, &|root| adapters.repo.checkout_at(root))?;
    let conflicts = conflict_views(adapters)?;
    let probe = match crate::settings::actions::get_unlock_period(adapters, transport) {
        Ok(period) => json!({"kind":"unlocked","period":period.period}),
        Err(e) if e.code == ErrorCode::Locked => json!({"kind":"locked"}),
        Err(_) => json!({"kind":"unreachable"}),
    };
    let checked_at = (adapters.now)();
    let mut rows = Vec::new();
    for link in local["links"].as_array().into_iter().flatten() {
        let root = link["root"].as_str().unwrap_or_default();
        let repo = checkout_repo(&state, root);
        let approval = approvals.get(root).copied().unwrap_or("needs-approval");
        let changes = diffs
            .iter()
            .find(|d| d["root"] == link["root"] && d["path"] == link["path"]);
        let conflict = conflicts.iter().find(|c| {
            c["path"] == link["path"]
                && c["roots"]
                    .as_array()
                    .is_some_and(|a| a.contains(&link["root"]))
        });
        let held = held.get(
            &Path::new(root)
                .join(link["path"].as_str().unwrap_or_default())
                .to_string_lossy()
                .into_owned(),
        );
        let status = file_status(&IFileFacts {
            local_only: link["localOnly"] == true,
            placement: link["status"].as_str().unwrap_or_default(),
            conflict: link["conflict"] == true,
            held_back: held.is_some(),
            changed: changes.is_some_and(|c| c["differs"] == true),
            remote: repo.is_some_and(|r| remote.iter().any(|v| v == r)),
        });
        let mut file = json!({"path":link["path"],"mode":link["mode"],"status":status});
        if let Some(held) = held {
            file["held"] = (*held).into();
        }
        if let Some(conflict) = conflict.filter(|_| link["conflict"] == true) {
            file["conflictId"] = conflict["id"].clone();
        }
        if let Some(changes) = changes.filter(|d| d["differs"] == true) {
            file["keys"] = key_changes(changes);
        }
        rows.push(json!({"repoId":repo.unwrap_or("unapproved"),"root":root,"approval":approval,"file":file}));
    }
    let statuses = rows
        .iter()
        .map(|r| r["file"]["status"].as_str().unwrap_or_default())
        .collect::<Vec<_>>();
    Ok(
        json!({"kind":"configured","overview":{"vaultId":state["vaultId"].as_str().unwrap_or_default().chars().take(8).collect::<String>(),"server":{"address":state["server"]["address"],"reachability":local["server"]},"deviceName":state["deviceName"],"unlock":derive_unlock(state["session"].get("unlockedUntil"),&probe,checked_at as f64),"checkedAt":checked_at,"pending":pending_count(&statuses)},"repos":group_repos(&rows),"conflicts":conflicts}),
    )
}

fn checkout_approvals<'a>(
    state: &'a Value,
    lookup: &dyn Fn(&str) -> Result<Option<envden_core::adapters::ICheckout>>,
) -> Result<std::collections::HashMap<&'a str, &'static str>> {
    let mut approvals = std::collections::HashMap::new();
    for link in state["links"].as_array().into_iter().flatten() {
        let root = link["root"].as_str().unwrap_or_default();
        if approvals.contains_key(root) {
            continue;
        }
        let approval = match lookup(root)? {
            Some(checkout) => match checkout_approval(state, &checkout) {
                "ask" => "needs-approval",
                v => v,
            },
            None => "unavailable",
        };
        approvals.insert(root, approval);
    }
    Ok(approvals)
}

fn key_changes(change: &Value) -> Value {
    if change["kind"] == "diff" {
        return json!({"kind":"diff","added":change["added"],"removed":change["removed"],"changed":change["changed"]});
    }
    let mut result = json!({"kind":"unparsed","reason":change["reason"]});
    if let Some(key) = change
        .get("key")
        .filter(|v| v.as_str().is_some_and(|s| !s.is_empty()))
    {
        result["key"] = key.clone();
    }
    result
}

fn conflict_views(adapters: &IAdapters) -> Result<Vec<Value>> {
    conflict_records(&adapters.home)?.iter().map(|r| {
        let mine=if r.mine_deleted {None}else{read_bytes(Path::new(&r.mine))?};
        let server=if r.deleted {None}else{read_bytes(Path::new(&r.server))?};
        let keys=match diff_env_keys(server.as_deref().unwrap_or_default(),mine.as_deref().unwrap_or_default()) {
            Ok(diff)=>json!({"kind":"diff","added":diff.added,"removed":diff.removed,"changed":diff.changed}),
            Err(conflict)=>{let mut keys=json!({"kind":"unparsed","reason":conflict.reason});if let Some(key)=conflict.key {keys["key"]=key.into();} keys}
        };
        Ok(json!({"id":r.file,"path":r.path,"roots":r.targets.iter().map(|t|&t.root).collect::<Vec<_>>(),"keys":keys,"serverDeleted":r.deleted,"mineDeleted":r.mine_deleted}))
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checkout_approvals_look_up_each_root_once_in_link_order() {
        let calls = std::cell::RefCell::new(Vec::new());
        let state = json!({"links":[{"root":"/b"},{"root":"/a"},{"root":"/b"}]});
        let approvals = checkout_approvals(&state, &|root| {
            calls.borrow_mut().push(root.to_owned());
            Ok(None)
        })
        .unwrap();
        assert_eq!(*calls.borrow(), ["/b", "/a"]);
        assert_eq!(approvals["/b"], "unavailable");
    }

    #[test]
    fn key_changes_omits_empty_conflict_key() {
        assert_eq!(
            key_changes(&json!({"kind":"conflict", "reason":"duplicate-key", "key":""})),
            json!({"kind":"unparsed", "reason":"duplicate-key"})
        );
    }
}
