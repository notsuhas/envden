use crate::client::IClient;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::json;

pub enum TPassword<'a> {
    Fixed(&'a str),
    Prompt(&'a mut dyn FnMut(bool) -> Result<String>),
}

pub fn login(
    client: &IClient,
    vault_id: &[u8; 32],
    mut password: TPassword<'_>,
    purpose: p::TLoginPurpose,
) -> Result<Option<p::IUnlockWindow>> {
    let fixed = matches!(password, TPassword::Fixed(_));
    for attempt in 1..=3 {
        let value = match &mut password {
            TPassword::Fixed(value) => (*value).to_owned(),
            TPassword::Prompt(prompt) => prompt(attempt > 1)?,
        };
        let start = p::opaque_start_login(p::IStartClientLoginParams {
            password: value.clone(),
        })?;
        let response = client.request(
            "/v1/opaque/login/start",
            "POST",
            Some(&json!({"purpose":purpose, "message":start.start_login_request})),
        )?;
        let body: p::IMessageResponse =
            serde_json::from_value(response.json()?).map_err(invalid)?;
        let finish = p::opaque_finish_login(p::IFinishClientLoginParams {
            password: value,
            client_login_state: start.client_login_state,
            login_response: body.message,
            identifiers: Some(p::unlock_identifiers(vault_id).identifiers),
            key_stretching_function_config: None,
        })?;
        let Some(finish) = finish else {
            if fixed || attempt == 3 {
                return Err(EnvdenError::new(
                    ErrorCode::Unauthorized,
                    "Wrong master password",
                ));
            }
            continue;
        };
        let response = client.request(
            "/v1/opaque/login/finish",
            "POST",
            Some(&json!({"purpose":purpose,"message":finish.finish_login_request})),
        )?;
        let result: p::TLoginFinishResponse =
            serde_json::from_value(response.json()?).map_err(invalid)?;
        return match (&purpose, result) {
            (
                p::TLoginPurpose::Unlock,
                p::TLoginFinishResponse::Unlocked {
                    unlocked_until,
                    fresh_until,
                },
            ) => Ok(Some(p::IUnlockWindow {
                unlocked_until,
                fresh_until,
            })),
            (p::TLoginPurpose::Kit, p::TLoginFinishResponse::Ticket {}) => Ok(None),
            _ => Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Invalid login result",
            )),
        };
    }
    unreachable!()
}

fn invalid(cause: serde_json::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::InvalidData, "Invalid login result", cause)
}
