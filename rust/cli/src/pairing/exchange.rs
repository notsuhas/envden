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
    let value: envden_protocol::protocol::IMailboxWriteResponse = serde_json::from_value(value)
        .map_err(|cause| {
            EnvdenError::with_source(ErrorCode::InvalidData, "Invalid pairing response", cause)
        })?;
    Ok(value.expires_at.max(0) as u64)
}

pub(super) fn wait(client: &IClient, path: &str, now: TClock, expiry: u64) -> Result<String> {
    wait_with_pause(
        path,
        now,
        expiry,
        || client.request(path, "GET", None)?.json(),
        || (client.options.backoff)(500),
    )
}

fn wait_with_pause(
    path: &str,
    now: TClock,
    expiry: u64,
    mut request: impl FnMut() -> Result<serde_json::Value>,
    mut pause: impl FnMut(),
) -> Result<String> {
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
        match request() {
            Ok(value) => {
                let (next_expiry, message) = super::response::response(&value, expiry)?;
                expiry = next_expiry;
                if let Some(message) = message {
                    return Ok(message);
                }
            }
            Err(error) if error.code == ErrorCode::NotFound && path == "/v1/pairing/approver" => {}
            Err(error) => return Err(error),
        }
        pause();
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

#[cfg(test)]
mod pause_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static CLOCK: AtomicU64 = AtomicU64::new(0);
    fn now() -> u64 {
        CLOCK.load(Ordering::SeqCst)
    }
    #[test]
    fn pending_exchange_uses_injected_pause() {
        CLOCK.store(0, Ordering::SeqCst);
        let mut calls = 0;
        let result = wait_with_pause(
            "/v1/pairing/approver",
            now,
            10,
            || Ok(json!({"kind":"pending"})),
            || {
                calls += 1;
                CLOCK.store(10, Ordering::SeqCst);
            },
        );
        assert_eq!(result.unwrap_err().code, ErrorCode::Busy);
        assert_eq!(calls, 1);
    }
}
