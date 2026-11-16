use super::exchange::{put, wait};
use crate::{adapters::IAdapters, client::IClient, identity::IDeviceIdentity};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

pub(super) fn finish(
    adapters: &IAdapters,
    client: &IClient,
    identity: &IDeviceIdentity,
    rejoin: bool,
) -> Result<Value> {
    super::cleanup::run(adapters, super::cleanup::TPhase::Finish, || {
        let expiry = std::fs::read_to_string(adapters.home.join("state/pair-expiry"))
            .ok()
            .and_then(|v| v.parse::<u64>().ok());
        if expiry.is_some_and(|v| (adapters.now)() < v)
            && let Ok(saved) = std::fs::read_to_string(adapters.home.join("state/pair-joiner"))
        {
            resend(client, &saved)?;
        }
        wait(
            client,
            "/v1/pairing/approver",
            adapters.now,
            expiry
                .map(|v| v.saturating_add(86_400_000))
                .unwrap_or_else(|| (adapters.now)() + 86_400_000),
        )?;
        super::resume::resume(adapters, client, identity, rejoin)
    })
}

fn resend(client: &IClient, saved: &str) -> Result<()> {
    if saved.is_empty() {
        return Ok(());
    }
    let value: Value = serde_json::from_str(saved).map_err(|e| {
        EnvdenError::with_source(ErrorCode::Internal, "Invalid stored pairing exchange", e)
    })?;
    let invalid = || EnvdenError::new(ErrorCode::InvalidData, "Invalid stored pairing exchange");
    let mailbox = value["mailbox"].as_f64().ok_or_else(invalid)?;
    let mailbox = if mailbox == 0.0 { 0.0 } else { mailbox };
    let ke3 = value["ke3"].as_str().ok_or_else(invalid)?;
    let message = value["message"].as_str().ok_or_else(invalid)?;
    let result =
        put(client, mailbox, "KE3", ke3).and_then(|_| put(client, mailbox, "PairJoiner", message));

    match result {
        Ok(_) => Ok(()),
        Err(error) if error.code == ErrorCode::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn missing_ke3_stops_resend_before_pair_joiner() {
        let (client, transport) = super::super::tests::client(vec![
            (404, json!({"error":"NOT_FOUND"})),
            (200, json!({"kind":"written","expiresAt":100})),
        ]);
        resend(&client, r#"{"mailbox":7,"ke3":"ke3","message":"message"}"#).unwrap();
        assert_eq!(
            *transport.requests.borrow(),
            vec![("PUT".into(), "/v1/pairing/mailboxes/7/KE3".into())]
        );
    }

    #[test]
    fn validates_all_fields_before_resending() {
        let (client, transport) =
            super::super::tests::client(vec![(200, json!({"kind":"written","expiresAt":100}))]);
        assert_eq!(
            resend(&client, r#"{"mailbox":7,"ke3":"ke3","message":false}"#)
                .unwrap_err()
                .code,
            ErrorCode::InvalidData
        );
        assert!(transport.requests.borrow().is_empty());
    }

    #[test]
    fn stored_numeric_mailbox_is_sent_without_integer_coercion() {
        for mailbox in [-1.5, 0.0, 4_294_967_296.0] {
            let (client, transport) =
                super::super::tests::client(vec![(404, json!({"error":"NOT_FOUND"}))]);
            resend(
                &client,
                &json!({"mailbox":mailbox,"ke3":"ke3","message":"message"}).to_string(),
            )
            .unwrap();
            assert_eq!(
                *transport.requests.borrow(),
                vec![("PUT".into(), format!("/v1/pairing/mailboxes/{mailbox}/KE3"))]
            );
        }
    }

    #[test]
    fn malformed_json_preserves_saved_exchange() {
        let dir = tempfile::tempdir().unwrap();
        let adapters =
            crate::adapters::create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let path = adapters.home.join("state/pair-joiner");
        crate::state::files::atomic_write(&path, b"{", 42).unwrap();
        let (client, transport) = super::super::tests::client(vec![]);
        crate::state::files::atomic_write(&adapters.home.join("state/pair-expiry"), b"100", 42)
            .unwrap();
        let identity = crate::identity::device_identity(
            &*adapters.keychain,
            &adapters.home,
            "test",
            true,
            &|| 42,
        )
        .unwrap();
        let error = finish(&adapters, &client, &identity, false).unwrap_err();
        assert_eq!(error.code, ErrorCode::Internal);
        assert_eq!(crate::output::error_exit_code(error.code), 1);
        assert!(path.exists());
        assert!(transport.requests.borrow().is_empty());
    }
}
