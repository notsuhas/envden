use super::{
    devices::recovery_holders,
    material::{current_material, next_epoch},
};
use crate::{
    adapters::create_adapters,
    admin::shared::context::IAdminContext,
    client::{
        IClientOptions, IHttpRequest, IHttpResponse, ITransport, binary, create_client, text,
    },
    vault::{create_vault_swap, history::IVaultHistory},
};
use envden_core::errors::Result;
use envden_protocol::{chain as c, protocol as p};
use serde_json::json;
use std::{cell::Cell, rc::Rc};

struct IFixtureTransport {
    keys: p::IDeviceKeys,
    keyring: Vec<u8>,
    requests: Rc<Cell<usize>>,
}

impl ITransport for IFixtureTransport {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        let body = if request.url.path() == "/v1/hello" {
            let challenge = request
                .url
                .query_pairs()
                .find(|(k, _)| k == "challenge")
                .unwrap()
                .1
                .into_owned();
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
        } else {
            assert!(request.url.path().starts_with("/v1/keyrings/"));
            self.requests.set(self.requests.get() + 1);
            self.keyring.clone()
        };
        Ok(IHttpResponse {
            status: 200,
            location: None,
            body,
        })
    }
}

#[test]
fn epoch_rotation_keeps_old_keys_and_wraps_every_remaining_member() {
    let root = tempfile::tempdir().unwrap();
    let adapters = create_adapters(
        Some(root.path().join("state")),
        root.path().to_owned(),
        || 123,
    );
    let (identity, genesis) = crate::vault::tests::fixture();
    let creation = create_vault_swap(&genesis, &identity, "password", &text(&[0; 192]), 1).unwrap();
    let entries = creation.swap.entries;
    let c::TDeviceListResult::Valid { state } = c::verify_chain(&entries).unwrap() else {
        panic!("chain")
    };
    let history = IVaultHistory {
        entries,
        headers: vec![creation.swap.header],
        states: [(state.seq, *state.clone())].into(),
        state: *state,
    };
    let server = p::generate_device_keys(p::random_bytes);
    let requests = Rc::new(Cell::new(0));
    let client = create_client(IClientOptions {
        address: "http://server.test".into(),
        pin: p::server_pin(&server.recovery.obj_pub).unwrap(),
        vault_id: genesis.vault_id,
        record: identity.record.clone(),
        req_sk: identity.keys.req_sk,
        version: "1.0.0".into(),
        now: std::rc::Rc::new(|| 123),
        transport: Rc::new(IFixtureTransport {
            keys: server,
            keyring: genesis.keyring.clone(),
            requests: requests.clone(),
        }),
        proof: None,
        unlock: None,
        backoff: Rc::new(|_| panic!("no retry")),
    });
    let context = IAdminContext {
        adapters: &adapters,
        local: json!({}),
        identity,
        vault_id: genesis.vault_id,
        client,
    };
    let old = current_material(&context, &history).unwrap();
    assert_eq!(old.key, genesis.epoch_key);
    let (change, bytes) = next_epoch(&context, &history, &history.state.recovery, None).unwrap();
    assert_eq!(change.epoch, 2);
    assert_eq!(change.wraps.len(), 2);
    assert!(
        change
            .wraps
            .windows(2)
            .all(|v| v[0].recipient < v[1].recipient)
    );
    let wrap = change
        .wraps
        .iter()
        .find(|w| w.recipient == context.identity.record.id)
        .unwrap();
    let key = p::open_wrap(
        wrap,
        &context.identity.keys.enc_sk,
        &context.identity.record.enc_pub,
        &context.vault_id,
        2,
        &change.key_commit,
    )
    .unwrap();
    let mut commits = history.state.commits.clone();
    commits.insert(2, change.key_commit);
    let ring = p::open_keyring(
        &bytes,
        &key,
        &context.vault_id,
        2,
        &commits,
        Some(&genesis.id_key),
    )
    .unwrap();
    assert_eq!(
        ring.older,
        vec![p::IOlderKey {
            epoch: 1,
            key: genesis.epoch_key
        }]
    );
    assert_eq!(
        recovery_holders(&history),
        [context.identity.record.id].into()
    );
    let (removed, _) = next_epoch(
        &context,
        &history,
        &history.state.recovery,
        Some(context.identity.record.id),
    )
    .unwrap();
    assert_eq!(removed.wraps.len(), 1);
    assert_eq!(removed.wraps[0].recipient, history.state.recovery.id);
    requests.set(0);
    let names = crate::admin::repair::missing_blob_names(&context, &history, &[], &[]).unwrap();
    assert!(names.0.is_empty() && names.1.is_empty());
    assert_eq!(requests.get(), 1);
}
