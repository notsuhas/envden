use super::IGenesis;
use crate::{client::binary, identity::IDeviceIdentity};
use envden_core::errors::Result;
use envden_protocol::protocol as p;

pub struct IVaultCreation {
    pub swap: p::ISwap,
    pub secret_key: String,
    pub vault_id: String,
}

pub fn create_vault_swap(
    material: &IGenesis,
    identity: &IDeviceIdentity,
    password: &str,
    registration_record: &str,
    now: u64,
) -> Result<IVaultCreation> {
    let secret = p::random_bytes();
    let envelope = p::seal_envelope(
        &p::IEnvelope {
            vault_id: material.vault_id,
            recovery_enc_sk: material.recovery_keys.enc_sk,
            recovery_obj_sk: material.recovery_keys.obj_sk,
            checkpoint: [0; 32],
            sealed_at: now,
        },
        password,
        &secret,
        &p::random_bytes(),
        &p::random_bytes(),
    )?;
    let files = p::IFiles { entries: vec![] };
    let header = p::sign_object(
        p::IManifestHeader {
            vault_id: material.vault_id,
            seq: 1,
            op: 0,
            prev: [0; 32],
            list_seq: 1,
            list_head: p::object_hash(&material.epoch, "entry")?,
            epoch: 1,
            keyring_hash: p::h("keyring-blob", &material.keyring),
            files_hash: p::h("files", &p::encode(&files)?),
            envelope_hash: p::h("envelope-blob", &envelope),
            created_at: now,
            signer: identity.record.id,
        },
        &identity.keys.obj_sk,
        "manifest",
    )?;
    Ok(IVaultCreation {
        swap: p::ISwap {
            expected_head: [0; 32],
            entries: vec![material.genesis.clone(), material.epoch.clone()],
            header,
            files: Some(files),
            keyring: Some(material.keyring.clone()),
            envelope: Some(envelope),
            sk_pub: Some(p::sk_pub(&secret, &material.vault_id)),
            opaque_record: Some(binary(registration_record)?),
            approver: None,
        },
        secret_key: p::encode_secret_key(&secret),
        vault_id: p::base32(&material.vault_id),
    })
}
