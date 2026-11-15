use crate::identity::IDeviceIdentity;
use envden_core::errors::Result;
use envden_protocol::protocol as p;

pub struct IGenesis {
    pub vault_id: [u8; 32],
    pub genesis: p::ISigned<p::TEntry>,
    pub epoch: p::ISigned<p::TEntry>,
    pub keyring: Vec<u8>,
    pub epoch_key: [u8; 32],
    pub id_key: [u8; 32],
    pub recovery_keys: p::IRecoveryKeys,
}

pub fn create_genesis(identity: &IDeviceIdentity, pin: [u8; 32], now: u64) -> Result<IGenesis> {
    let recovery_keys = p::generate_recovery_keys(p::random_bytes);
    let recovery = p::IRecoveryRecord {
        id: p::recovery_id(&recovery_keys.enc_pub, &recovery_keys.obj_pub),
        enc_pub: recovery_keys.enc_pub,
        obj_pub: recovery_keys.obj_pub,
    };
    let genesis = p::sign_object(
        p::TEntry {
            vault_id: [0; 32],
            seq: 0,
            parent: [0; 32],
            signer: identity.record.id,
            change: p::TEntryPayload::Genesis(p::IGenesis {
                server_pin: pin,
                device: identity.record.clone(),
                recovery: recovery.clone(),
                vault_nonce: p::random_bytes(),
                created_at: now,
            }),
        },
        &identity.keys.obj_sk,
        "entry",
    )?;
    let vault_id = p::object_hash(&genesis, "entry")?;
    let epoch_key = p::random_bytes();
    let mut wraps = vec![
        p::seal_wrap(
            &epoch_key,
            &vault_id,
            1,
            &identity.record.id,
            &identity.record.enc_pub,
            &p::random_bytes(),
        )?,
        p::seal_wrap(
            &epoch_key,
            &vault_id,
            1,
            &recovery.id,
            &recovery.enc_pub,
            &p::random_bytes(),
        )?,
    ];
    wraps.sort_by_key(|w| w.recipient);
    let epoch = p::sign_object(
        p::TEntry {
            vault_id,
            seq: 1,
            parent: vault_id,
            signer: identity.record.id,
            change: p::TEntryPayload::NewEpoch(p::INewEpoch {
                change: p::IEpochChange {
                    epoch: 1,
                    key_commit: p::key_commit(&epoch_key, &vault_id, 1),
                    wraps,
                },
            }),
        },
        &identity.keys.obj_sk,
        "entry",
    )?;
    let id_key = p::random_bytes();
    let keyring = p::seal_keyring(
        &p::IKeyring {
            vault_id,
            epoch: 1,
            id_key,
            older: vec![],
        },
        &epoch_key,
        &p::random_bytes(),
    )?;
    Ok(IGenesis {
        vault_id,
        genesis,
        epoch,
        keyring,
        epoch_key,
        id_key,
        recovery_keys,
    })
}
