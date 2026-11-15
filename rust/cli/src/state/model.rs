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
        .is_some_and(|s| s.get("creationPending").is_some())
    {
        return Err(EnvdenError::new(
            ErrorCode::Conflict,
            "Setup didn't finish. Run envden setup again to finish it",
        ));
    }
    state
        .filter(|s| s.get("server").is_some() && s.get("vaultId").is_some())
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, NOT_SET_UP))
}
