use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::{Value, json};

pub type TLocalState = Value;
pub const NOT_SET_UP: &str = "Not set up yet. Run envden setup or envden join";

pub fn empty_state(device_name: &str) -> TLocalState {
    json!({"format":1,"deviceName":device_name,"headers":[],"entries":[],"approved":[],"links":[],"aliases":{},"telemetry":false,"updateCheck":true})
}

pub fn require_configured(state: Option<TLocalState>) -> Result<TLocalState> {
    if state
        .as_ref()
        .is_some_and(|s| s.get("creationPending").is_some_and(truthy))
    {
        return Err(EnvdenError::new(
            ErrorCode::Conflict,
            "Setup didn't finish. Run envden setup again to finish it",
        ));
    }
    state
        .filter(|s| s.get("server").is_some_and(truthy) && s.get("vaultId").is_some_and(truthy))
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, NOT_SET_UP))
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value.as_f64().is_some_and(|v| v != 0.0),
        Value::String(value) => !value.is_empty(),
        _ => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configured_guard_uses_javascript_truthiness() {
        for pending in [json!(null), json!(false), json!(0), json!("")] {
            let state = json!({"creationPending":pending,"server":{},"vaultId":"vault"});
            assert!(require_configured(Some(state)).is_ok());
        }
        for value in [json!(null), json!(false), json!(0), json!("")] {
            for field in ["server", "vaultId"] {
                let mut state = json!({"server":{},"vaultId":"vault"});
                state[field] = value.clone();
                assert_eq!(
                    require_configured(Some(state)).unwrap_err().code,
                    ErrorCode::NotFound
                );
            }
        }
    }
}
