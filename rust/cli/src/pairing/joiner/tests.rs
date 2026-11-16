use super::*;
use crate::adapters::create_adapters;

#[test]
fn resume_preflight_errors_preserve_exchange() {
    let dir = tempfile::tempdir().unwrap();
    let adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
    adapters
        .keychain
        .set(
            &format!("envden/{}/pair-receive", adapters.home.display()),
            &[1; 32],
        )
        .unwrap();
    atomic_write(&adapters.home.join("state/pair-pin"), b"!", 42).unwrap();
    assert_eq!(
        join(&adapters, "http://server.test", &json!({"resume":true}))
            .unwrap_err()
            .code,
        ErrorCode::InvalidData
    );
    assert!(adapters.home.join("state/pair-pin").exists());
}

#[test]
fn exchange_failure_before_saved_message_clears_any_error() {
    let dir = tempfile::tempdir().unwrap();
    let adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
    atomic_write(&adapters.home.join("state/pair-pin"), b"pin", 42).unwrap();
    let error =
        super::super::cleanup::run(&adapters, super::super::cleanup::TPhase::Exchange, || {
            Err(EnvdenError::new(ErrorCode::ServerUnreachable, "test"))
        })
        .unwrap_err();
    assert_eq!(error.code, ErrorCode::ServerUnreachable);
    assert!(!adapters.home.join("state/pair-pin").exists());
}
