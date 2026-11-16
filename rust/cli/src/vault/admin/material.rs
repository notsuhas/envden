use crate::{admin::shared::context::IAdminContext, client::text, vault::history::IVaultHistory};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::collections::BTreeMap;

pub struct IMaterial {
    pub key: [u8; 32],
    pub ring: p::IKeyring,
    pub keys: BTreeMap<u32, [u8; 32]>,
}

impl IMaterial {
    pub fn epoch_key(&self, epoch: u32) -> Result<&[u8; 32]> {
        self.keys.get(&epoch).ok_or_else(|| {
            EnvdenError::new(
                ErrorCode::InvalidData,
                "Vault key for an earlier epoch is missing",
            )
        })
    }
}

pub fn current_material(context: &IAdminContext<'_>, history: &IVaultHistory) -> Result<IMaterial> {
    let head = &history.headers.last().expect("history").body;
    let own = context.identity.record.id;
    let wrap = crate::onboarding::accept::epoch_wrap(&history.entries, &own);
    let wrap = wrap
        .ok_or_else(|| EnvdenError::new(ErrorCode::Unauthorized, "Device is no longer a member"))?;
    let commit =
        history.state.commits.get(&head.epoch).ok_or_else(|| {
            EnvdenError::new(ErrorCode::Unauthorized, "Device is no longer a member")
        })?;
    let key = p::open_wrap(
        &wrap,
        &context.identity.keys.enc_sk,
        &context.identity.record.enc_pub,
        &context.vault_id,
        head.epoch,
        commit,
    )?;
    let bytes = context
        .client
        .request(
            &format!("/v1/keyrings/{}", text(&head.keyring_hash)),
            "GET",
            None,
        )?
        .body;
    if p::h("keyring-blob", &bytes) != head.keyring_hash {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Keyring hash mismatch",
        ));
    }
    let known = context.adapters.keychain.get(
        &format!("envden/{}/id-key", context.adapters.home.display()),
        false,
    )?;
    let known = known.as_deref().map(p::fixed).transpose()?;
    let ring = p::open_keyring(
        &bytes,
        &key,
        &context.vault_id,
        head.epoch,
        &history.state.commits,
        known.as_ref(),
    )?;
    let mut keys: BTreeMap<_, _> = ring.older.iter().map(|v| (v.epoch, v.key)).collect();
    keys.insert(ring.epoch, key);
    Ok(IMaterial { key, ring, keys })
}

pub fn next_epoch(
    context: &IAdminContext<'_>,
    history: &IVaultHistory,
    recovery: &p::IRecoveryRecord,
    removed: Option<[u8; 16]>,
) -> Result<(p::IEpochChange, Vec<u8>)> {
    let material = current_material(context, history)?;
    let key = p::random_bytes();
    let epoch = history.state.epoch + 1;
    let mut recipients: Vec<_> = history
        .state
        .devices
        .values()
        .filter(|d| Some(d.id) != removed)
        .map(|d| (d.id, d.enc_pub))
        .collect();
    recipients.push((recovery.id, recovery.enc_pub));
    let mut wraps = recipients
        .into_iter()
        .map(|(id, public)| {
            p::seal_wrap(
                &key,
                &context.vault_id,
                epoch,
                &id,
                &public,
                &p::random_bytes(),
            )
        })
        .collect::<Result<Vec<_>>>()?;
    wraps.sort_by_key(|w| w.recipient);
    let mut older = material.ring.older;
    older.push(p::IOlderKey {
        epoch: material.ring.epoch,
        key: material.key,
    });
    let keyring = p::seal_keyring(
        &p::IKeyring {
            vault_id: context.vault_id,
            epoch,
            id_key: material.ring.id_key,
            older,
        },
        &key,
        &p::random_bytes(),
    )?;
    Ok((
        p::IEpochChange {
            epoch,
            key_commit: p::key_commit(&key, &context.vault_id, epoch),
            wraps,
        },
        keyring,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_epoch_key_fails_as_invalid_data() {
        let material = IMaterial {
            key: [7; 32],
            ring: p::IKeyring {
                vault_id: [0; 32],
                epoch: 3,
                id_key: [0; 32],
                older: vec![],
            },
            keys: BTreeMap::from([(3, [7; 32])]),
        };

        assert_eq!(material.epoch_key(3).unwrap(), &[7; 32]);
        for epoch in [1, 2] {
            let error = material.epoch_key(epoch).unwrap_err();

            assert_eq!(error.code, ErrorCode::InvalidData);
            assert_eq!(error.message, "Vault key for an earlier epoch is missing");
        }
    }
}
