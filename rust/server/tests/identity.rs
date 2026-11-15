mod fixture;
use envden_core::adapters::storage::IStoredVault;
use envden_protocol::protocol::*;
use envden_server::identity::{
    initialize_setup, load_server_keys, local_setup_token, reissue_setup,
};

#[test]
fn signing_key_and_opaque_setup_persist_privately() {
    let directory = tempfile::tempdir().unwrap();
    let first = load_server_keys(directory.path()).unwrap();
    #[cfg(unix)]
    {
        use std::{fs, os::unix::fs::PermissionsExt};
        fs::set_permissions(directory.path(), fs::Permissions::from_mode(0o755)).unwrap();
        fs::set_permissions(
            directory.path().join("identity.json"),
            fs::Permissions::from_mode(0o644),
        )
        .unwrap();
    }
    assert_eq!(first, load_server_keys(directory.path()).unwrap());
    #[cfg(unix)]
    {
        use std::{fs, os::unix::fs::PermissionsExt};
        assert_eq!(
            fs::metadata(directory.path()).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(directory.path().join("identity.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}

#[test]
fn local_setup_reissues_until_vault_exists() {
    let directory = tempfile::tempdir().unwrap();
    let first = local_setup_token(directory.path(), 1).unwrap().unwrap();
    let second = local_setup_token(directory.path(), 2).unwrap().unwrap();
    assert!(is_token(TTokenKind::Setup, &first));
    assert_ne!(first, second);
}

#[test]
fn setup_preserves_hash_replaces_explicitly_and_stays_consumed() {
    let (_directory, options) = fixture::fixture();
    let storage = options.storage.as_ref();
    let public = &options.server_keys.public_key;
    let first = initialize_setup(storage, public, None).unwrap().unwrap();
    let secret = decode_token(TTokenKind::Setup, &first).unwrap().0;
    assert_eq!(
        storage.setup_token().unwrap().unwrap(),
        token_key(TTokenKind::Setup, &secret)
    );
    assert!(initialize_setup(storage, public, None).unwrap().is_none());
    let replacement = encode_token(
        TTokenKind::Setup,
        &random_bytes(),
        &server_pin(public).unwrap(),
    );
    assert_eq!(
        initialize_setup(storage, public, Some(&replacement))
            .unwrap()
            .unwrap(),
        replacement
    );
    let bad = encode_token(TTokenKind::Setup, &random_bytes(), &[0; 32]);
    assert!(initialize_setup(storage, public, Some(&bad)).is_err());
    storage
        .configure_vault(
            &[1; 32],
            &IStoredVault {
                active: true,
                ..Default::default()
            },
            &[],
            storage.setup_token().unwrap().as_deref(),
        )
        .unwrap();
    assert!(reissue_setup(storage, public).unwrap().is_none());
    assert!(initialize_setup(storage, public, None).unwrap().is_none());
}

#[test]
fn discarded_move_does_not_reissue_setup_on_restart() {
    let (_directory, options) = fixture::fixture();
    let storage = options.storage.as_ref();
    initialize_setup(storage, &options.server_keys.public_key, None).unwrap();
    storage
        .configure_vault(
            &[1; 32],
            &IStoredVault::default(),
            &[],
            storage.setup_token().unwrap().as_deref(),
        )
        .unwrap();
    storage.discard_inactive_vault(&[1; 32]).unwrap();
    assert!(
        initialize_setup(storage, &options.server_keys.public_key, None)
            .unwrap()
            .is_none()
    );
}

#[test]
fn malformed_identity_is_not_replaced() {
    let directory = tempfile::tempdir().unwrap();
    std::fs::write(directory.path().join("identity.json"), "{}").unwrap();
    assert!(load_server_keys(directory.path()).is_err());
    assert_eq!(
        std::fs::read_to_string(directory.path().join("identity.json")).unwrap(),
        "{}"
    );
}
