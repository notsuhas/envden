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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        adapters::create_adapters,
        identity::device_identity,
        vault::{create_genesis, create_vault_swap},
    };

    #[test]
    fn pending_requires_both_keys_and_matching_commit() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let identity =
            device_identity(&*adapters.keychain, &adapters.home, "test", false, 42).unwrap();
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
