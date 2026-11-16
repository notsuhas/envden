use envden_protocol::protocol as p;

pub(super) fn matches_pending(
    swap: &p::ISwap,
    vault: &[u8; 32],
    epoch: Option<&[u8]>,
    id: Option<&[u8]>,
    device: &[u8; 16],
) -> bool {
    let Some(epoch) = epoch.and_then(|v| <&[u8; 32]>::try_from(v).ok()) else {
        return false;
    };
    id.is_some()
        && swap.header.body.signer == *device
        && swap
            .entries
            .iter()
            .find_map(|entry| {
                if let p::TEntryPayload::NewEpoch(change) = &entry.body.change {
                    Some(change.change.key_commit == p::key_commit(epoch, vault, 1))
                } else {
                    None
                }
            })
            .unwrap_or(false)
}

type TPending = (p::ISwap, Vec<u8>, [u8; 32]);

pub(super) fn resumable(
    adapters: &crate::adapters::IAdapters,
    pending: &serde_json::Value,
    device: &[u8; 16],
) -> envden_core::errors::Result<Option<TPending>> {
    if pending["vaultId"].as_str().is_none_or(str::is_empty) || !pending["server"].is_object() {
        return Ok(None);
    }
    let Some(encoded) = pending["creationPending"].as_str() else {
        return Ok(None);
    };
    let epoch = adapters.keychain.get(
        &format!("envden/{}/epoch/1", adapters.home.display()),
        false,
    )?;
    let id = adapters
        .keychain
        .get(&format!("envden/{}/id-key", adapters.home.display()), false)?;
    if epoch.is_none() || id.is_none() {
        return Ok(None);
    }
    let bytes = crate::client::binary(encoded)?;
    let swap: p::ISwap = p::decode(&bytes)?;
    let vault_id = p::fixed(&p::unbase32(
        pending["vaultId"].as_str().unwrap_or_default(),
    )?)?;
    if !matches_pending(&swap, &vault_id, epoch.as_deref(), id.as_deref(), device) {
        return Ok(None);
    }
    Ok(Some((swap, bytes, vault_id)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        adapters::create_adapters,
        identity::device_identity,
        vault::{create_genesis, create_vault_swap},
    };

    #[test]
    fn missing_keys_skip_malformed_pending_creation() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let state =
            serde_json::json!({"creationPending":"bad", "vaultId":p::base32(&[1;32]),"server":{}});
        assert!(resumable(&adapters, &state, &[0; 16]).unwrap().is_none());
    }

    #[test]
    fn pending_requires_both_keys_and_matching_commit() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let identity =
            device_identity(&*adapters.keychain, &adapters.home, "test", false, &|| 42).unwrap();
        let material = create_genesis(&identity, [2; 32], 42).unwrap();
        let creation = create_vault_swap(
            &material,
            &identity,
            "password",
            &crate::client::text(&[0; 192]),
            42,
        )
        .unwrap();
        let valid = |epoch: Option<&[u8]>, id: Option<&[u8]>| {
            matches_pending(
                &creation.swap,
                &material.vault_id,
                epoch,
                id,
                &identity.record.id,
            )
        };
        assert!(valid(Some(&material.epoch_key), Some(&material.id_key)));
        assert!(!valid(None, Some(&material.id_key)));
        assert!(!valid(Some(&material.epoch_key), None));
        assert!(!valid(Some(&[3; 32]), Some(&material.id_key)));
    }
}
