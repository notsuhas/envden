use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

pub(super) fn response(body: &Value, expiry: u64) -> Result<(u64, Option<String>)> {
    if let Some(message) = body["message"].as_str() {
        return Ok((
            body["expiresAt"].as_u64().unwrap_or(expiry).min(expiry),
            Some(message.into()),
        ));
    }
    if body["kind"] == "pending"
        && (body["expiresAt"].as_u64().is_some() || body.get("expiresAt").is_none())
    {
        return Ok((
            body["expiresAt"].as_u64().unwrap_or(expiry).min(expiry),
            None,
        ));
    }
    Err(EnvdenError::new(
        ErrorCode::InvalidData,
        "Invalid pairing response",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn response_preserves_and_caps_expiry() {
        for (body, expected) in [
            (json!({"kind":"pending","expiresAt":123}), (123, None)),
            (
                json!({"message":"ready","expiresAt":123}),
                (123, Some("ready".into())),
            ),
            (
                json!({"message":"approval"}),
                (999, Some("approval".into())),
            ),
            (json!({"kind":"pending","expiresAt":99999999}), (999, None)),
        ] {
            assert_eq!(response(&body, 999).unwrap(), expected);
        }
        for value in [json!({}), json!({"message":42}), json!({"kind":"other"})] {
            assert_eq!(
                response(&value, 999).unwrap_err().code,
                ErrorCode::InvalidData
            );
        }
    }
}
