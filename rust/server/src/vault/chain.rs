use envden_core::{
    adapters::storage::IStorageAdapter,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::{
    chain::{IDeviceListState, TDeviceListResult, verify_chain},
    protocol::*,
};

pub(crate) fn vault_chain(
    storage: &dyn IStorageAdapter,
    vault: &[u8],
) -> Result<(ISigned<IManifestHeader>, IDeviceListState)> {
    let head = storage
        .head(vault)?
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Missing head"))?;
    let stored = storage
        .header(vault, &head)?
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Invalid stored chain"))?;
    let header: ISigned<IManifestHeader> = decode(&stored.bytes)?;
    let entries = storage
        .entries(vault, 0, header.body.list_seq, None, None)?
        .into_iter()
        .map(|row| decode::<ISigned<TEntry>>(&row.bytes))
        .collect::<Result<Vec<_>>>()?;
    let TDeviceListResult::Valid { state } = verify_chain(&entries)? else {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Invalid stored chain",
        ));
    };

    Ok((header, *state))
}

pub(crate) fn membership(
    storage: &dyn IStorageAdapter,
    vault: &[u8],
    device: &[u8; 16],
) -> Result<Option<IDeviceRecord>> {
    if storage.head(vault)?.is_none() {
        return Ok(None);
    }

    Ok(vault_chain(storage, vault)?.1.devices.get(device).cloned())
}

pub(crate) fn ordered_devices(
    storage: &dyn IStorageAdapter,
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
