use super::*;
use crate::{adapters::create_adapters, client::text, state::empty_state, vault::tests::fixture};
use envden_core::errors::ErrorCode;
use envden_protocol::protocol as p;
use serde_json::json;

#[test]
fn checkpoint_material_authenticates_keyring_and_requires_keys() {
    let (identity, material) = fixture();
    let creation = super::super::create_vault_swap(
        &material,
        &identity,
        "fixture password",
        &text(&[7; 192]),
        123,
    )
    .unwrap();
    let root = tempfile::tempdir().unwrap();
    let adapters = create_adapters(Some(root.path().join("home")), root.path().to_owned(), || 0);
    let mut state = empty_state("test");
    assert_eq!(
        checkpoint_material(&adapters, &state)
            .err()
            .unwrap()
            .message,
        "Missing checkpoint material"
    );
    state["checkpoint"] = text(&p::object_hash(&creation.swap.header, "manifest").unwrap()).into();
    state["vaultId"] = p::base32(&material.vault_id).into();
    state["files"] = text(&p::encode(creation.swap.files.as_ref().unwrap()).unwrap()).into();
    state["keyring"] = text(&material.keyring).into();
    state["headers"] = json!([text(&p::encode(&creation.swap.header).unwrap())]);
    state["entries"] = json!([
        text(&p::encode(&material.genesis).unwrap()),
        text(&p::encode(&material.epoch).unwrap())
    ]);
    assert_eq!(
        checkpoint_material(&adapters, &state).err().unwrap().code,
        ErrorCode::Locked
    );
    for (name, key) in [("id-key", material.id_key), ("epoch/1", material.epoch_key)] {
        adapters
            .keychain
            .set(&format!("envden/{}/{name}", adapters.home.display()), &key)
            .unwrap();
    }
    let checkpoint = checkpoint_material(&adapters, &state).unwrap();
    assert_eq!(checkpoint.keys[&1], material.epoch_key);
    assert_eq!(checkpoint.checkpoint.id_key, material.id_key);
    assert_eq!(checkpoint.checkpoint.state.vault_id, material.vault_id);
    state["checkpoint"] = text(&[9; 32]).into();
    assert_eq!(
        checkpoint_material(&adapters, &state)
            .err()
            .unwrap()
            .message,
        "Missing checkpoint header"
    );
}

#[test]
fn verified_state_encoding_preserves_chain_insertion_order() {
    use envden_protocol::chain as c;
    let (_, material) = fixture();
    let entries = vec![material.genesis.clone(), material.epoch.clone()];
    let c::TDeviceListResult::Valid { state } = c::verify_chain(&entries).unwrap() else {
        panic!("valid chain");
    };
    let encoded = encode_verified_state(&state, &entries).unwrap();
    assert_eq!(decode_verified_state(&encoded).unwrap(), *state);
    let p::TEntryPayload::Genesis(genesis) = &material.genesis.body.change else {
        panic!("genesis");
    };
    assert_eq!(
        encoded["everUsedIds"]["$set"],
        json!([
            p::base32(&genesis.device.id),
            p::base32(&genesis.recovery.id)
        ])
    );
    let mut state = *state;
    let high = [255; 16];
    let low = [0; 16];
    let mut extra = genesis.device.clone();
    extra.id = high;
    state.devices.insert(high, extra.clone());
    let mut add = material.epoch.clone();
    add.body.seq = 2;
    add.body.change = p::TEntryPayload::AddDevice(p::IAddDevice {
        device: extra.clone(),
        wrap: p::IWrap {
            recipient: high,
            enc: [0; 32],
            ct: vec![],
        },
    });
    extra.id = low;
    state.devices.insert(low, extra.clone());
    let mut next = add.clone();
    next.body.seq = 3;
    if let p::TEntryPayload::AddDevice(payload) = &mut next.body.change {
        payload.device = extra;
    }
    state.ever_used_ids.extend([high, low]);
    state.seq = 3;
    let mut entries = entries;
    entries.extend([add, next]);
    let encoded = encode_verified_state(&state, &entries).unwrap();
    let devices = encoded["devices"]["$map"].as_array().unwrap();
    assert_eq!(devices[1][0], p::base32(&high));
    assert_eq!(devices[2][0], p::base32(&low));
    assert_eq!(decode_verified_state(&encoded).unwrap(), state);
    assert!(encode_verified_state(&state, &[]).is_err());
}
