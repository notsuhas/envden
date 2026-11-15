use envden_core::{
    adapters::storage::IStorageAdapter,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::{
    chain::{IDeviceListState, TDeviceListResult, verify_chain},
    protocol::*,
};
use std::sync::{Arc, LazyLock, Mutex, Weak};

struct CachedList {
    storage: Weak<dyn IStorageAdapter>,
    vault: Vec<u8>,
    head: [u8; 32],
    state: IDeviceListState,
}

static LISTS: LazyLock<Mutex<Vec<CachedList>>> = LazyLock::new(|| Mutex::new(vec![]));

pub(super) fn verified_list(
    storage: &Arc<dyn IStorageAdapter>,
    vault: &[u8],
    header: &IManifestHeader,
) -> Result<IDeviceListState> {
    let identity = Arc::downgrade(storage);
    {
        let mut lists = LISTS.lock().expect("chain cache lock");
        lists.retain(|entry| entry.storage.strong_count() > 0);
        if let Some(entry) = lists.iter().find(|entry| {
            Weak::ptr_eq(&entry.storage, &identity)
                && entry.vault == vault
                && entry.head == header.list_head
        }) {
            return Ok(entry.state.clone());
        }
    }
    let entries = storage
        .entries(vault, 0, header.list_seq, None, None)?
        .into_iter()
        .map(|row| decode::<ISigned<TEntry>>(&row.bytes))
        .collect::<Result<Vec<_>>>()?;
    let TDeviceListResult::Valid { state } = verify_chain(&entries)? else {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Invalid stored chain",
        ));
    };
    let mut lists = LISTS.lock().expect("chain cache lock");
    lists.retain(|entry| !(Weak::ptr_eq(&entry.storage, &identity) && entry.vault == vault));
    lists.push(CachedList {
        storage: identity,
        vault: vault.to_vec(),
        head: header.list_head,
        state: (*state).clone(),
    });

    Ok(*state)
}
