use super::{IDeviceIdentity, ISecretKeys, identity_bytes, read_identity};
use crate::state::{lock::with_state_lock, repository::load_state};
use envden_core::{
    adapters::IKeychainAdapter,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol as p;
use std::path::Path;

pub fn device_identity(
    keychain: &dyn IKeychainAdapter,
    namespace: &Path,
    name: &str,
    fresh: bool,
    clock: &dyn Fn() -> u64,
) -> Result<IDeviceIdentity> {
    with_state_lock(namespace, clock, || {
        let slot = format!("envden/{}/device", namespace.display());
        if let Some(stored) = keychain.get(&slot, false)?
            && !fresh
        {
            return read_identity(&stored);
        }
        if let Some(state) = load_state(namespace)?
            && (state.get("verifiedState").is_some()
                || (state.get("vaultId").is_some() && state.get("creationPending").is_none()))
        {
            return Err(EnvdenError::new(
                ErrorCode::Locked,
                "Vault keys unavailable",
            ));
        }
        let generated = p::generate_device_keys(p::random_bytes);
        let record = p::IDeviceRecord {
            id: p::device_id(
                &generated.recovery.enc_pub,
                &generated.recovery.obj_pub,
                &generated.req_pub,
            ),
            name: name.into(),
            enc_pub: generated.recovery.enc_pub,
            obj_pub: generated.recovery.obj_pub,
            req_pub: generated.req_pub,
        };
        let keys = ISecretKeys {
            enc_sk: generated.recovery.enc_sk,
            obj_sk: generated.recovery.obj_sk,
            req_sk: generated.req_sk,
        };
        keychain.set(&slot, &identity_bytes(&keys, &record)?)?;
        Ok(IDeviceIdentity { keys, record })
    })
}
