use crate::client::IClient;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::json;

pub fn register_password(client: &IClient, vault_id: &[u8; 32], password: &str) -> Result<String> {
    let start = p::opaque_start_registration(p::IStartClientRegistrationParams {
        password: password.into(),
    })?;
    let response = client.request(
        "/v1/opaque/registration/start",
        "POST",
        Some(&json!({"message":start.registration_request})),
    )?;
    let body: p::IMessageResponse = serde_json::from_value(response.json()?).map_err(|cause| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid server response", cause)
    })?;
    let finish = p::opaque_finish_registration(p::IFinishClientRegistrationParams {
        password: password.into(),
        registration_response: body.message,
        client_registration_state: start.client_registration_state,
        identifiers: Some(p::unlock_identifiers(vault_id).identifiers),
        key_stretching_function_config: None,
    })?;
    client.request(
        "/v1/opaque/registration/finish",
        "POST",
        Some(&json!({"message":finish.registration_record})),
    )?;
    Ok(finish.registration_record)
}
