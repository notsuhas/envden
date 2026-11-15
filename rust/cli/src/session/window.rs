use crate::client::IClient;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::IUnlockWindow;
use serde_json::Value;

pub fn record_unlock_window(client: &IClient, state: &mut Value) -> Result<()> {
    let response = match client.request("/v1/unlock-window", "GET", None) {
        Err(error) if matches!(error.code, ErrorCode::Locked | ErrorCode::RestoredMode) => {
            return Ok(());
        }
        result => result?,
    };
    let window: IUnlockWindow = serde_json::from_value(response.json()?).map_err(|cause| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid server response", cause)
    })?;
    state["session"] = serde_json::to_value(window).expect("serializable window");
    Ok(())
}
