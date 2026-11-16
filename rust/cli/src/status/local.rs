use crate::{
    adapters::IAdapters,
    client::{ITransport, binary, hello},
    state::repository::load_state,
    sync::local::conflicts::conflict_records,
    updates::status::update_status,
    version::MIN_SERVER,
};
use envden_core::{
    adapters::{TPlacementMode, TPlacementState},
    errors::Result,
};
use envden_protocol::protocol::fixed;
use serde_json::{Value, json};
use std::path::Path;

pub fn local_status(
    adapters: &IAdapters,
    refresh: bool,
    transport: &dyn ITransport,
) -> Result<Value> {
    let state = load_state(&adapters.home)?;
    let Some(state) = state.filter(|s| s.get("server").is_some() && s.get("vaultId").is_some())
    else {
        return Ok(
            json!({"configured":false,"server":"unknown","links":[],"update":update_status(&adapters.home)?}),
        );
    };
    let conflicts = conflict_records(&adapters.home)?;
    let mut links = Vec::new();
    for link in state["links"].as_array().into_iter().flatten() {
        let root = link["root"].as_str().unwrap_or_default();
        let path = link["path"].as_str().unwrap_or_default();
        let mode = if link["mode"] == "copy" {
            TPlacementMode::Copy
        } else {
            TPlacementMode::Link
        };
        let status = adapters.placement(mode, Path::new(root)).inspect(
            link["store"].as_str().unwrap_or_default(),
            &Path::new(root).join(path).to_string_lossy(),
        )?;
        links.push(json!({"root":root,"path":path,"mode":link["mode"],"localOnly":link["localOnly"].as_bool().unwrap_or(false),"status":placement_name(status),"conflict":conflicts.iter().any(|r| r.root == root && r.path == path)}));
    }
    let pin = fixed(&binary(
        state["server"]["pin"].as_str().unwrap_or_default(),
    )?)?;
    let reachability = hello(
        state["server"]["address"].as_str().unwrap_or_default(),
        Some(&pin),
        transport,
        MIN_SERVER,
    );
    let mut result = json!({"configured":true,"vaultId":state["vaultId"],"server":"reachable"});
    if let Err(error) = reachability {
        let (server, reason) = super::reachability::server_reachability(&error);
        result["server"] = server.into();
        result["serverReason"] = reason.into();
    }
    if refresh {
        crate::notice::cache::refresh_notice(
            &adapters.home,
            &state,
            |r| adapters.repo.case_insensitive(r, true),
            &adapters.now,
        )?;
    }
    result["links"] = links.into();
    result["update"] = update_status(&adapters.home)?;
    Ok(result)
}

fn placement_name(state: TPlacementState) -> &'static str {
    match state {
        TPlacementState::Linked => "linked",
        TPlacementState::Relinkable => "relinkable",
        TPlacementState::Detached => "detached",
        TPlacementState::Missing => "missing",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct NeverCall;
    impl ITransport for NeverCall {
        fn fetch(&self, _: crate::client::IHttpRequest) -> Result<crate::client::IHttpResponse> {
            panic!("unconfigured status must not use the network")
        }
    }
    #[test]
    fn unconfigured_status_has_reference_shape() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = crate::adapters::create_adapters(
            Some(dir.path().to_owned()),
            dir.path().to_owned(),
            || 1,
        );
        assert_eq!(
            local_status(&adapters, false, &NeverCall).unwrap(),
            json!({"configured":false,"server":"unknown","links":[],"update":{"available":false,"required":false}})
        );
    }
}
