use envden_core::{
    adapters::storage::{IStateWrite, IStorageAdapter, TStateKind},
    errors::Result,
};

pub(super) fn index(storage: &dyn IStorageAdapter, key: &str, vault: &[u8]) -> Result<()> {
    storage.write_state(
        &[0; 32],
        &[IStateWrite {
            kind: TStateKind::PairingIndex,
            key: key.as_bytes().to_vec(),
            bytes: Some(vault.to_vec()),
        }],
    )
}

pub(super) fn lookup(storage: &dyn IStorageAdapter, vault: &[u8], key: &str) -> Result<Vec<u8>> {
    if vault != [0; 32] {
        return Ok(vault.to_vec());
    }

    Ok(storage
        .state(&[0; 32], TStateKind::PairingIndex, key.as_bytes())?
        .unwrap_or_else(|| vec![0; 32]))
}
