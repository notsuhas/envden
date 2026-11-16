use super::{accept, latest_membership};
use crate::{
    adapters::create_adapters,
    client::{IHttpRequest, IHttpResponse, ITransport, binary, text},
    identity::device_identity,
    state::lock::{ILockTiming, with_state_lock_timing},
    vault::{create_genesis, history::IVaultHistory},
};
use envden_core::errors::{ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};
use serde_json::json;
use std::{path::PathBuf, rc::Rc};

struct ITransportFixture {
    home: PathBuf,
    keys: p::IDeviceKeys,
    keyring: Vec<u8>,
    files: Vec<u8>,
}

impl ITransport for ITransportFixture {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        let home = self.home.clone();
        let competing = std::thread::spawn(move || {
            with_state_lock_timing(
                &home,
                &ILockTiming {
                    now: &|| 42,
                    wait: &|_| panic!("no waits"),
                    delays: &[],
                },
                || Ok(()),
            )
            .unwrap_err()
            .code
        });
        assert_eq!(competing.join().unwrap(), ErrorCode::Conflict);
        let body = match request.url.path() {
            "/v1/hello" => {
                let challenge = request
                    .url
                    .query_pairs()
                    .find(|(k, _)| k == "challenge")
                    .unwrap()
                    .1;
                let hello = p::build_hello(
                    p::IServerHello {
                        challenge: p::fixed(&binary(&challenge)?)?,
                        host: "server.test".into(),
                        server_sign_pub: self.keys.recovery.obj_pub,
                        app_version: "1.0.0".into(),
                        min_client: "0.0.0".into(),
                        protocols: vec![1],
                    },
                    &self.keys.recovery.obj_sk,
                )?;
                serde_json::to_vec(&json!({"hello":text(&p::encode(&hello)?)})).unwrap()
            }
            "/v1/unlock-window" => {
                return Ok(IHttpResponse {
                    status: 403,
                    location: None,
                    body: br#"{"error":"LOCKED"}"#.to_vec(),
                });
            }
            path if path.starts_with("/v1/keyrings/") => self.keyring.clone(),
            path if path.starts_with("/v1/files/") => self.files.clone(),
            _ => panic!("unexpected request"),
        };
        Ok(IHttpResponse {
            status: 200,
            location: None,
            body,
        })
    }
}

#[test]
fn acceptance_locks_network_and_second_acceptance_reads_committed_checkpoint() {
    let dir = tempfile::tempdir().unwrap();
    let adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
    let identity = device_identity(&*adapters.keychain, &adapters.home, "test", false, 42).unwrap();
    let keys = p::generate_device_keys(p::random_bytes);
    let pin = p::server_pin(&keys.recovery.obj_pub).unwrap();
    let material = create_genesis(&identity, pin, 42).unwrap();
    let entries = vec![material.genesis, material.epoch];
    let c::TDeviceListResult::Valid { state } = c::verify_chain(&entries).unwrap() else {
        panic!("valid chain")
    };
    let files = p::encode(&p::IFiles { entries: vec![] }).unwrap();
    let header = p::sign_object(
        p::IManifestHeader {
            vault_id: material.vault_id,
            seq: 1,
            op: 0,
            prev: [0; 32],
            list_seq: 1,
            list_head: p::object_hash(&entries[1], "entry").unwrap(),
            epoch: 1,
            keyring_hash: p::h("keyring-blob", &material.keyring),
            files_hash: p::h("files", &files),
            envelope_hash: [0; 32],
            created_at: 42,
            signer: identity.record.id,
        },
        &identity.keys.obj_sk,
        "manifest",
    )
    .unwrap();
    let hash = p::object_hash(&header, "manifest").unwrap();
    let mut history = IVaultHistory {
        entries,
        headers: vec![header],
        state: *state.clone(),
        states: [(1, *state)].into(),
    };
    let mut client = crate::onboarding::vault::connection::connection(
        &adapters,
        "http://server.test",
        pin,
        material.vault_id,
        &identity,
    );
    client.options.transport = Rc::new(ITransportFixture {
        home: adapters.home.clone(),
        keys,
        keyring: material.keyring,
        files,
    });
    let mut other = crate::state::empty_state("old");
    other["vaultId"] = json!(p::base32(&[9; 32]));
    other["aliases"] = json!({"old":"kept"});
    crate::state::repository::save_state(&adapters.home, &other, 42).unwrap();
    assert_eq!(
        accept(&adapters, &client, &identity, &history, &hash)
            .unwrap_err()
            .code,
        ErrorCode::Conflict
    );
    other["creationPending"] = json!("pending");
    crate::state::repository::save_state(&adapters.home, &other, 42).unwrap();
    let local = accept(&adapters, &client, &identity, &history, &hash).unwrap();
    assert_eq!(local["aliases"], json!({}));
    assert!(local.get("creationPending").is_none());
    assert_eq!(local["checkpoint"], text(&hash));
    history.headers[0].body.created_at = 41;
    history.headers[0] = p::sign_object(
        history.headers[0].body.clone(),
        &identity.keys.obj_sk,
        "manifest",
    )
    .unwrap();
    let older = p::object_hash(&history.headers[0], "manifest").unwrap();
    assert_eq!(
        accept(&adapters, &client, &identity, &history, &older)
            .unwrap_err()
            .code,
        ErrorCode::Fork
    );
    let context = crate::admin::shared::context::IAdminContext {
        adapters: &adapters,
        local: json!({"server":{"address":"http://server.test"}}),
        identity: identity.clone(),
        vault_id: history.state.vault_id,
        client: crate::client::create_client(client.options.clone()),
    };
    let swap = p::ISwap {
        expected_head: [0; 32],
        entries: vec![],
        header: history.headers[0].clone(),
        files: None,
        keyring: None,
        envelope: None,
        sk_pub: None,
        opaque_record: None,
        approver: None,
    };
    let error = crate::state::lock::with_state_lock(&adapters.home, 42, || {
        crate::vault::admin::commit::accept(&context, &swap, &history)
    })
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::Fork);
    assert_eq!(
        crate::state::repository::load_state(&adapters.home)
            .unwrap()
            .unwrap()["checkpoint"],
        text(&hash)
    );
}

mod remaining;
