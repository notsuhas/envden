use crate::protocol::{
    codecs::IKeyring,
    crypto::{kdf, open_box, seal_box},
    encoding::*,
    epochs::key_commit,
};
use envden_core::errors::Result;
use std::collections::BTreeMap;

fn ad(vault: &[u8; 32], epoch: u32) -> Vec<u8> {
    [ctx("keyring"), vault.to_vec(), epoch.to_be_bytes().to_vec()].concat()
}

pub fn seal_keyring(value: &IKeyring, key: &[u8; 32], nonce: &[u8; 24]) -> Result<Vec<u8>> {
    seal_box(
        &kdf(
            key,
            &value.vault_id,
            "keyring-key",
            &value.epoch.to_be_bytes(),
        ),
        &encode(value)?,
        &ad(&value.vault_id, value.epoch),
        nonce,
    )
}

pub fn open_keyring(
    blob: &[u8],
    key: &[u8; 32],
    vault: &[u8; 32],
    epoch: u32,
    commits: &BTreeMap<u32, [u8; 32]>,
    known: Option<&[u8; 32]>,
) -> Result<IKeyring> {
    let v: IKeyring = decode(&open_box(
        &kdf(key, vault, "keyring-key", &epoch.to_be_bytes()),
        blob,
        &ad(vault, epoch),
    )?)?;
    require_value(
        v.vault_id == *vault && v.epoch == epoch,
        "Invalid protocol data",
    )?;
    if let Some(id) = known {
        require_value(v.id_key == *id, "ID key changed")?;
    }
    for (e, k) in v
        .older
        .iter()
        .map(|v| (v.epoch, &v.key))
        .chain(std::iter::once((epoch, key)))
    {
        require_value(
            commits.get(&e) == Some(&key_commit(k, vault, e)),
            "Epoch commit mismatch",
        )?;
    }
    Ok(v)
}
