use super::{identity_bytes, read_identity};
use envden_core::{adapters::IKeychainAdapter, errors::Result};
use envden_protocol::protocol::IDeviceRecord;
use std::path::Path;

pub fn adopt_committed_name(
    keychain: &dyn IKeychainAdapter,
    home: &Path,
    committed: &IDeviceRecord,
) -> Result<()> {
    for suffix in ["rejoin/device", "device"] {
        let slot = format!("envden/{}/{suffix}", home.display());
        let Some(stored) = keychain.get(&slot, false)? else {
            continue;
        };
        let mut identity = read_identity(&stored)?;
        if identity.record.id != committed.id || identity.record.name == committed.name {
            continue;
        }
        identity.record.name.clone_from(&committed.name);
        keychain.set(&slot, &identity_bytes(&identity.keys, &identity.record)?)?;
    }
    Ok(())
}
