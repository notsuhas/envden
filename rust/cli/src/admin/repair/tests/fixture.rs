use crate::{
    adapters::{IAdapters, create_adapters},
    client::{IHttpRequest, IHttpResponse, ITransport, binary, text},
    identity::device_identity,
    state::{empty_state, repository::save_state},
    vault::create_genesis,
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use serde_json::json;
use std::{cell::RefCell, rc::Rc};
mod transport;
pub(crate) use transport::Server;

pub(crate) fn fixture() -> (tempfile::TempDir, IAdapters, Rc<Server>, String) {
    let dir = tempfile::tempdir().unwrap();
    let adapters = create_adapters(Some(dir.path().join("envden")), dir.path().into(), || {
        1800000000000
    });
    let identity = device_identity(
        &*adapters.keychain,
        &adapters.home,
        "laptop",
        false,
        &adapters.now,
    )
    .unwrap();
    let keys = p::generate_device_keys(p::random_bytes);
    let pin = p::server_pin(&keys.recovery.obj_pub).unwrap();
    let material = create_genesis(&identity, pin, (adapters.now)()).unwrap();
    let entries = vec![material.genesis, material.epoch];
    let header = p::sign_object(
        p::IManifestHeader {
            vault_id: material.vault_id,
            seq: 1,
            prev: [0; 32],
            list_seq: entries[1].body.seq,
            list_head: p::object_hash(&entries[1], "entry").unwrap(),
            epoch: 1,
            op: 1,
            keyring_hash: p::h("keyring-blob", &material.keyring),
            files_hash: p::h("files", &p::encode(&p::IFiles { entries: vec![] }).unwrap()),
            envelope_hash: [0; 32],
            created_at: (adapters.now)(),
            signer: identity.record.id,
        },
        &identity.keys.obj_sk,
        "manifest",
    )
    .unwrap();
    let secret = [7; 20];
    let token = p::encode_token(p::TTokenKind::Repair, &secret, &pin);
    let server = Rc::new(Server {
        keys,
        entries: entries.clone(),
        headers: vec![header.clone()],
        keyring: material.keyring.clone(),
        reports: RefCell::new(vec![]),
        requests: RefCell::new(vec![]),
        id: p::h("repair-id", &secret),
        recovery: material.recovery_keys,
    });
    let mut local = empty_state("laptop");
    local["vaultId"] = p::base32(&material.vault_id).into();
    local["server"] = json!({"address":"https://server.test","pin":text(&pin),"protocol":1});
    local["entries"] = json!(
        entries
            .iter()
            .map(|e| text(&p::encode(e).unwrap()))
            .collect::<Vec<_>>()
    );
    local["headers"] = json!([text(&p::encode(&header).unwrap())]);
    local["files"] = text(&p::encode(&p::IFiles { entries: vec![] }).unwrap()).into();
    local["keyring"] = text(&material.keyring).into();
    local["checkpoint"] = text(&p::object_hash(&header, "manifest").unwrap()).into();
    adapters
        .keychain
        .set(
            &format!("envden/{}/epoch/1", adapters.home.display()),
            &material.epoch_key,
        )
        .unwrap();
    adapters
        .keychain
        .set(
            &format!("envden/{}/id-key", adapters.home.display()),
            &material.id_key,
        )
        .unwrap();
    save_state(&adapters.home, &local, &adapters.now).unwrap();
    (dir, adapters, server, token)
}
