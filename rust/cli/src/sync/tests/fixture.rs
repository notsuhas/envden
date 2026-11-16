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
pub(super) struct Server {
    pub(super) keys: p::IDeviceKeys,
    pub(super) entries: Vec<p::ISigned<p::TEntry>>,
    pub(super) headers: Vec<p::ISigned<p::IManifestHeader>>,
    pub(super) keyring: Vec<u8>,
    pub(super) requests: RefCell<Vec<String>>,
    pub(super) destination: Option<p::IDeviceKeys>,
}

impl ITransport for Server {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        let path = request.url.path();
        self.requests
            .borrow_mut()
            .push(format!("{}{}", request.url.host_str().unwrap(), path));
        let value = match path {
            "/v1/hello" => {
                let challenge = request
                    .url
                    .query_pairs()
                    .find(|(k, _)| k == "challenge")
                    .unwrap()
                    .1
                    .into_owned();
                let keys = if request.url.host_str() == Some("destination.test") {
                    self.destination.as_ref().unwrap()
                } else {
                    &self.keys
                };
                let hello = p::build_hello(
                    p::IServerHello {
                        challenge: p::fixed(&binary(&challenge)?)?,
                        host: request.url.host_str().unwrap().into(),
                        server_sign_pub: keys.recovery.obj_pub,
                        app_version: "1.0.0".into(),
                        min_client: "0.0.0".into(),
                        protocols: vec![1],
                    },
                    &keys.recovery.obj_sk,
                )?;
                json!({"hello":text(&p::encode(&hello)?)})
            }
            "/v1/entries" | "/v1/headers" => {
                let from = request
                    .url
                    .query_pairs()
                    .find(|(k, _)| k == "from")
                    .unwrap()
                    .1
                    .parse::<u64>()
                    .unwrap();
                let objects = if path == "/v1/entries" {
                    self.entries
                        .iter()
                        .filter(|e| e.body.seq >= from)
                        .map(|v| text(&p::encode(v).unwrap()))
                        .collect::<Vec<_>>()
                } else {
                    self.headers
                        .iter()
                        .filter(|e| e.body.seq >= from)
                        .map(|v| text(&p::encode(v).unwrap()))
                        .collect()
                };
                json!({"objects":objects})
            }
            "/v1/swap" => {
                let _: p::ISwap = p::decode(&request.body)?;
                json!({"kind":"swapped"})
            }
            "/v1/notice/ack" => json!({"kind":"acknowledged"}),
            "/v1/head" => {
                return Ok(IHttpResponse {
                    status: 200,
                    location: None,
                    body: p::encode(self.headers.last().unwrap())?,
                });
            }
            _ if path.starts_with("/v1/repair/material/") => json!({"kind":"stored"}),
            _ if path.starts_with("/v1/keyrings/") => {
                return Ok(IHttpResponse {
                    status: 200,
                    location: None,
                    body: self.keyring.clone(),
                });
            }
            _ if path.starts_with("/v1/files/") => {
                return Ok(IHttpResponse {
                    status: 200,
                    location: None,
                    body: p::encode(&p::IFiles { entries: vec![] })?,
                });
            }
            other => panic!("unexpected request {other}"),
        };
        Ok(IHttpResponse {
            status: 200,
            location: None,
            body: value.to_string().into_bytes(),
        })
    }
}

pub(super) fn fixture() -> (tempfile::TempDir, IAdapters, Rc<Server>, String) {
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
        requests: RefCell::new(vec![]),
        destination: None,
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
