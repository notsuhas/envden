use envden_core::{
    adapters::storage::IStorageAdapter,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::{chain::IDeviceListState, protocol::*};
use std::sync::Arc;

pub(crate) fn vault_chain(
    storage: &Arc<dyn IStorageAdapter>,
    vault: &[u8],
) -> Result<(ISigned<IManifestHeader>, IDeviceListState)> {
    let head = storage
        .head(vault)?
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Missing head"))?;
    let stored = storage
        .header(vault, &head)?
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Invalid stored chain"))?;
    let header: ISigned<IManifestHeader> = decode(&stored.bytes)?;
    let state = super::cache::verified_list(storage, vault, &header.body)?;

    Ok((header, state))
}

pub(crate) fn membership(
    storage: &Arc<dyn IStorageAdapter>,
    vault: &[u8],
    device: &[u8; 16],
) -> Result<Option<IDeviceRecord>> {
    if storage.head(vault)?.is_none() {
        return Ok(None);
    }

    Ok(vault_chain(storage, vault)?.1.devices.get(device).cloned())
}

pub(crate) fn ordered_devices(
    storage: &Arc<dyn IStorageAdapter>,
    vault: &[u8],
) -> Result<Vec<IDeviceRecord>> {
    let (_, state) = vault_chain(storage, vault)?;
    let mut order = Vec::new();
    for row in storage.entries(vault, 0, state.seq, None, None)? {
        let entry: ISigned<TEntry> = decode(&row.bytes)?;
        match entry.body.change {
            TEntryPayload::Genesis(genesis) => order.push(genesis.device.id),
            TEntryPayload::AddDevice(add) => order.push(add.device.id),
            TEntryPayload::RemoveDevice(remove) => order.retain(|id| *id != remove.device),
            _ => {}
        }
    }

    Ok(order
        .iter()
        .filter_map(|id| state.devices.get(id).cloned())
        .collect())
}
