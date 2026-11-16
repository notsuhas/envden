use serde_json::Value;

pub(super) fn configured_snapshot(state: &Value) -> bool {
    state["server"].is_object() && state["vaultId"].as_str().is_some_and(|id| !id.is_empty())
}

pub(super) fn configured_local(state: &Value, local: &Value) -> bool {
    local.get("vaultId").is_some() && configured_snapshot(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn dashboard_requires_the_local_vault_and_a_nonempty_state_id() {
        let state = json!({"server":{}, "vaultId":"vault"});
        assert!(configured_local(&state, &json!({"vaultId":"vault"})));
        assert!(!configured_local(&state, &json!({"configured":false})));
        assert!(!configured_snapshot(&json!({"server":{}, "vaultId":""})));
    }
}
