use super::context::invalid;
use crate::client::IClient;
use envden_core::errors::{ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Value, json};

pub fn repair_login(
    client: &IClient,
    vault_id: &[u8; 32],
    password: &str,
    kind: &str,
) -> Result<Value> {
    let identifiers = Some(p::unlock_identifiers(vault_id).identifiers);
    if kind == "register" {
        let start = p::opaque_start_registration(p::IStartClientRegistrationParams {
            password: password.into(),
        })?;
        let response: p::IMessageResponse = serde_json::from_value(
            client
                .request(
                    "/v1/opaque/registration/start",
                    "POST",
                    Some(&json!({"message":start.registration_request})),
                )?
                .json()?,
        )
        .map_err(|_| invalid(ErrorCode::InvalidData, "Invalid server response"))?;
        let finish = p::opaque_finish_registration(p::IFinishClientRegistrationParams {
            password: password.into(),
            registration_response: response.message,
            client_registration_state: start.client_registration_state,
            identifiers,
            key_stretching_function_config: None,
        })?;
        return Ok(json!({"kind":"registration", "message":finish.registration_record}));
    }
    let start = p::opaque_start_login(p::IStartClientLoginParams {
        password: password.into(),
    })?;
    let response: p::IMessageResponse = serde_json::from_value(
        client
            .request(
                "/v1/opaque/login/start",
                "POST",
                Some(&json!({"purpose":"unlock","message":start.start_login_request})),
            )?
            .json()?,
    )
    .map_err(|_| invalid(ErrorCode::InvalidData, "Invalid server response"))?;
    let finish = p::opaque_finish_login(p::IFinishClientLoginParams {
        password: password.into(),
        login_response: response.message,
        client_login_state: start.client_login_state,
        identifiers,
        key_stretching_function_config: None,
    })?
    .ok_or_else(|| invalid(ErrorCode::Unauthorized, "Password login failed"))?;
    Ok(json!({"kind":"login", "purpose":"unlock", "message":finish.finish_login_request}))
}
