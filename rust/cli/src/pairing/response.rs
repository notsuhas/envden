use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

pub(super) fn response(body: &Value, expiry: u64) -> Result<(u64, Option<String>)> {
    use envden_protocol::protocol as p;
    if let Ok(slot) = serde_json::from_value::<p::TMailboxSlotResponse>(body.clone()) {
        let (at, message) = match slot {
            p::TMailboxSlotResponse::Message {
                message,
                expires_at,
            } => (expires_at, Some(message)),
            p::TMailboxSlotResponse::Pending { expires_at, .. } => (expires_at, None),
        };
        return Ok((expiry.min(at.max(0) as u64), message));
    }
    if let Ok(message) = serde_json::from_value::<p::IMessageResponse>(body.clone()) {
        return Ok((expiry, Some(message.message)));
    }
    if serde_json::from_value::<p::IPendingResponse>(body.clone()).is_ok() {
        return Ok((expiry, None));
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
        for value in [
            json!({}),
            json!({"message":42}),
            json!({"kind":"other"}),
            json!({"message":"ok","extra":true}),
            json!({"message":"ok","expiresAt":"bad"}),
            json!({"kind":"pending","extra":true}),
        ] {
            assert_eq!(
                response(&value, 999).unwrap_err().code,
                ErrorCode::InvalidData
            );
        }
    }
}
