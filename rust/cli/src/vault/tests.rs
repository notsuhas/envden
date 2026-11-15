use super::*;
use crate::{
    client::{decode_history_entries, decode_history_header},
    identity::{IDeviceIdentity, ISecretKeys},
    version::VERSION,
};
use envden_core::errors::ErrorCode;
use envden_protocol::{chain as c, protocol as p};

fn fixture() -> (IDeviceIdentity, IGenesis) {
    let keys = p::generate_device_keys(p::random_bytes);
    let identity = IDeviceIdentity {
        keys: ISecretKeys {
            enc_sk: keys.recovery.enc_sk,
            obj_sk: keys.recovery.obj_sk,
            req_sk: keys.req_sk,
        },
        record: p::IDeviceRecord {
            id: p::device_id(
                &keys.recovery.enc_pub,
                &keys.recovery.obj_pub,
                &keys.req_pub,
            ),
            name: "test".into(),
            enc_pub: keys.recovery.enc_pub,
            obj_pub: keys.recovery.obj_pub,
            req_pub: keys.req_pub,
        },
    };
    let material = create_genesis(&identity, [0; 32], 0).unwrap();
    (identity, material)
}

#[test]
fn genesis_builds_valid_chain_and_wrapped_keyring() {
    let (identity, material) = fixture();
    assert!(matches!(
        c::verify_chain(&[material.genesis.clone(), material.epoch.clone()]).unwrap(),
        c::TDeviceListResult::Valid { .. }
    ));
    let keyring = p::open_keyring(
        &material.keyring,
        &material.epoch_key,
        &material.vault_id,
        1,
        &[(1, p::key_commit(&material.epoch_key, &material.vault_id, 1))].into(),
        None,
    )
    .unwrap();
    assert_eq!(keyring.id_key, material.id_key);
    let p::TEntryPayload::NewEpoch(epoch) = &material.epoch.body.change else {
        panic!("epoch")
    };
    let wrap = epoch
        .change
        .wraps
        .iter()
        .find(|w| w.recipient == identity.record.id)
        .unwrap();
    assert_eq!(
        p::open_wrap(
            wrap,
            &identity.keys.enc_sk,
            &identity.record.enc_pub,
            &material.vault_id,
            1,
            &epoch.change.key_commit
        )
        .unwrap(),
        material.epoch_key
    );
}

#[test]
fn unknown_history_is_authenticated_before_update_errors() {
    let (identity, material) = fixture();
    let genesis = p::encode(&material.genesis).unwrap();
    let mut body = p::encode(&material.epoch.body).unwrap();
    body[74] = 99;
    let signature = p::sign(&identity.keys.obj_sk, "entry", &body);
    let mut unknown = [body, signature.to_vec()].concat();
    assert_eq!(
        decode_history_entries(&[genesis.clone(), unknown.clone()], &[], "999.0.0", None)
            .err()
            .unwrap()
            .code,
        ErrorCode::UpdateRequired
    );
    let last = unknown.len() - 1;
    unknown[last] ^= 1;
    assert_eq!(
        decode_history_entries(&[genesis, unknown], &[], "999.0.0", None)
            .err()
            .unwrap()
            .code,
        ErrorCode::InvalidData
    );
    let header_body = [&[2, 2][..], &identity.record.id].concat();
    let header = [
        header_body.clone(),
        p::sign(&identity.keys.obj_sk, "manifest", &header_body).to_vec(),
    ]
    .concat();
    assert_eq!(
        decode_history_header(
            &header,
            std::slice::from_ref(&material.genesis),
            &[],
            "999.0.0",
            None
        )
        .err()
        .unwrap()
        .code,
        ErrorCode::UpdateRequired
    );
    assert_eq!(
        decode_history_header(&header, &[material.genesis], &[], VERSION, None)
            .err()
            .unwrap()
            .code,
        ErrorCode::InvalidData
    );
}

#[test]
fn creation_binds_the_envelope_manifest_and_recovery_kit() {
    let (identity, material) = fixture();
    let creation = create_vault_swap(
        &material,
        &identity,
        "fixture password",
        &crate::client::text(&[7; 192]),
        123,
    )
    .unwrap();
    let swap = &creation.swap;
    assert_eq!(
        swap.header.body.list_head,
        p::object_hash(&material.epoch, "entry").unwrap()
    );
    assert_eq!(
        swap.header.body.keyring_hash,
        p::h("keyring-blob", swap.keyring.as_ref().unwrap())
    );
    assert_eq!(
        swap.header.body.files_hash,
        p::h("files", &p::encode(swap.files.as_ref().unwrap()).unwrap())
    );
    assert_eq!(
        swap.header.body.envelope_hash,
        p::h("envelope-blob", swap.envelope.as_ref().unwrap())
    );
    let secret = p::decode_secret_key(&creation.secret_key).unwrap();
    let envelope = p::open_envelope(
        swap.envelope.as_ref().unwrap(),
        "fixture password",
        &secret,
        &material.vault_id,
    )
    .unwrap();
    assert_eq!(envelope.recovery_enc_sk, material.recovery_keys.enc_sk);
    assert_eq!(envelope.recovery_obj_sk, material.recovery_keys.obj_sk);
    assert_eq!(envelope.sealed_at, 123);
    assert_eq!(envelope.checkpoint, [0; 32]);
    assert_eq!(swap.sk_pub, Some(p::sk_pub(&secret, &material.vault_id)));
    assert!(p::verify_object(
        &swap.header,
        &identity.record.obj_pub,
        "manifest"
    ));
    let bytes = p::encode(swap).unwrap();
    let decoded: p::ISwap = p::decode(&bytes).unwrap();
    assert_eq!(p::encode(&decoded).unwrap(), bytes);
}
