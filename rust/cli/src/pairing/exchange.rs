use crate::{client::IClient, time::TClock};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::json;

pub(super) fn put(client: &IClient, number: u32, slot: &str, message: &str) -> Result<u64> {
    let value = client
        .request(
            &format!("/v1/pairing/mailboxes/{number}/{slot}"),
            "PUT",
            Some(&json!({"message":message})),
        )?
        .json()?;
    value["expiresAt"]
        .as_u64()
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Invalid pairing response"))
}

pub(super) fn wait(client: &IClient, path: &str, now: TClock, expiry: u64) -> Result<String> {
    let deadline = expiry.min(
        now()
            + if path == "/v1/pairing/approver" {
                86_400_000
            } else {
                600_000
            },
    );
    let mut expiry = deadline;
    while now() < expiry {
        match client.request(path, "GET", None) {
            Ok(response) => {
                let value = response.json()?;
                let (next_expiry, message) = super::response::response(&value, expiry)?;
                expiry = next_expiry;
                if let Some(message) = message {
                    return Ok(message);
                }
            }
            Err(error) if error.code == ErrorCode::NotFound && path == "/v1/pairing/approver" => {}
            Err(error) => return Err(error),
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    Err(EnvdenError::new(
        ErrorCode::Busy,
        "Pairing timed out; run envden join --resume after approval, or create a new pairing code",
    ))
}

pub(super) fn require_window(expiry: u64, now: u64) -> Result<()> {
    if expiry > now.saturating_add(600_000) {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Pairing window exceeds ten minutes",
        ));
    }
    if now >= expiry {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Pairing exchange expired",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairing_window_boundaries() {
        assert!(require_window(600_042, 42).is_ok());
        assert_eq!(
            require_window(600_043, 42).unwrap_err().code,
            ErrorCode::InvalidData
        );
        for expiry in [0, 41, 42] {
            assert_eq!(
                require_window(expiry, 42).unwrap_err().code,
                ErrorCode::Unauthorized
            );
        }
    }
}
