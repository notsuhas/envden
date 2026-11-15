use super::*;
use crate::state::{empty_state, repository::save_state};
use envden_core::{
    adapters::IKeychainAdapter,
    errors::{ErrorCode, Result},
};
use std::{collections::HashMap, sync::Mutex};

#[derive(Default)]
struct Keychain(Mutex<HashMap<String, Vec<u8>>>);
impl IKeychainAdapter for Keychain {
    fn id(&self) -> &str {
        "test"
    }
    fn owner_only(&self) -> Result<bool> {
        Ok(true)
    }
    fn get(&self, name: &str, _: bool) -> Result<Option<Vec<u8>>> {
        Ok(self.0.lock().unwrap().get(name).cloned())
    }
    fn set(&self, name: &str, bytes: &[u8]) -> Result<()> {
        self.0.lock().unwrap().insert(name.into(), bytes.into());
        Ok(())
    }
    fn delete(&self, _: &str) -> Result<()> {
        panic!("unexpected delete")
    }
}

#[test]
fn independent_keys_survive_reload_in_their_namespace() {
    let root = tempfile::tempdir().unwrap();
    let keychain = Keychain::default();
    let first = device_identity(
        &keychain,
        &root.path().join("first"),
        "laptop",
        false,
        1800000000000,
    )
    .unwrap();
    assert_eq!(
        device_identity(
            &keychain,
            &root.path().join("first"),
            "ignored rename",
            false,
            1800000000000
        )
        .unwrap(),
        first
    );
    assert_ne!(first.keys.enc_sk, first.keys.obj_sk);
    assert_ne!(first.keys.req_sk, first.keys.obj_sk);
    assert_ne!(
        device_identity(
            &keychain,
            &root.path().join("second"),
            "other",
            false,
            1800000000000
        )
        .unwrap()
        .record
        .id,
        first.record.id
    );
}

#[test]
fn fresh_join_replaces_orphan_keys_and_name() {
    let root = tempfile::tempdir().unwrap();
    let keychain = Keychain::default();
    let old = device_identity(&keychain, root.path(), "old", false, 1800000000000).unwrap();
    let next = device_identity(&keychain, root.path(), "new", true, 1800000000000).unwrap();
    assert_ne!(old.record.id, next.record.id);
    assert_eq!(next.record.name, "new");
}

#[test]
fn configured_state_refuses_missing_identity() {
    let root = tempfile::tempdir().unwrap();
    let keychain = Keychain::default();
    let mut state = empty_state("joined");
    state["vaultId"] = "configured".into();
    save_state(root.path(), &state, 1800000000000).unwrap();
    assert_eq!(
        device_identity(&keychain, root.path(), "replacement", false, 1800000000000)
            .unwrap_err()
            .code,
        ErrorCode::Locked
    );
}

#[test]
fn stored_identity_authenticates_secrets_and_record() {
    let root = tempfile::tempdir().unwrap();
    let keychain = Keychain::default();
    let identity = device_identity(&keychain, root.path(), "laptop", false, 1800000000000).unwrap();
    let mut bytes = identity_bytes(&identity.keys, &identity.record).unwrap();
    bytes[32] ^= 1;
    assert_eq!(
        read_identity(&bytes).unwrap_err().message,
        "Device keys do not match their public record"
    );
    assert_eq!(
        read_identity(&[0; 95]).unwrap_err().message,
        "Invalid device identity"
    );
    let mut committed = identity.record.clone();
    committed.name = "renamed".into();
    adopt_committed_name(&keychain, root.path(), &committed).unwrap();
    assert_eq!(
        device_identity(&keychain, root.path(), "ignored", false, 1800000000000)
            .unwrap()
            .record
            .name,
        "renamed"
    );
}
