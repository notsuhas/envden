use crate::adapters::create_adapters;
use envden_core::{adapters::IKeychainAdapter, errors::Result};
use std::path::PathBuf;

struct ILockedKeychain(PathBuf);

impl IKeychainAdapter for ILockedKeychain {
    fn id(&self) -> &str {
        "test"
    }
    fn owner_only(&self) -> Result<bool> {
        Ok(true)
    }
    fn get(&self, _: &str, _: bool) -> Result<Option<Vec<u8>>> {
        panic!("unexpected read")
    }
    fn set(&self, _: &str, _: &[u8]) -> Result<()> {
        panic!("unexpected write")
    }
    fn delete(&self, _: &str) -> Result<()> {
        assert!(self.0.join("state/write.lock/owner.json").exists());
        Ok(())
    }
}

#[test]
fn pairing_cleanup_holds_lock_over_key_and_file_deletion() {
    let dir = tempfile::tempdir().unwrap();
    let mut adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
    adapters.keychain = Box::new(ILockedKeychain(adapters.home.clone()));
    std::fs::create_dir_all(adapters.home.join("state")).unwrap();
    std::fs::write(adapters.home.join("state/pair-pin"), "pin").unwrap();
    super::persistence::clear(&adapters).unwrap();
    assert!(!adapters.home.join("state/pair-pin").exists());
    assert!(!adapters.home.join("state/write.lock").exists());
}

use crate::client::{
    IClient, IClientOptions, IHttpRequest, IHttpResponse, ITransport, binary, create_client, text,
};
use envden_protocol::protocol as p;
use serde_json::{Value, json};
use std::{cell::RefCell, collections::VecDeque, rc::Rc};

pub(super) struct ITransportFixture {
    server: p::IDeviceKeys,
    pub(super) requests: RefCell<Vec<(String, String)>>,
    responses: RefCell<VecDeque<(u16, Value)>>,
}

impl ITransport for ITransportFixture {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        if request.url.path() == "/v1/hello" {
            let challenge = request
                .url
                .query_pairs()
                .find(|(k, _)| k == "challenge")
                .unwrap()
                .1
                .into_owned();
            let signed = p::build_hello(
                p::IServerHello {
                    challenge: p::fixed(&binary(&challenge)?)?,
                    host: "server.example".into(),
                    server_sign_pub: self.server.recovery.obj_pub,
                    app_version: crate::version::VERSION.into(),
                    min_client: "0.0.0".into(),
                    protocols: vec![1],
                },
                &self.server.recovery.obj_sk,
            )?;
            return Ok(IHttpResponse {
                location: None,
                status: 200,
                body: serde_json::to_vec(&json!({"hello":text(&p::encode(&signed)?)})).unwrap(),
            });
        }
        self.requests
            .borrow_mut()
            .push((request.method, request.url.path().into()));
        let (status, body) = self
            .responses
            .borrow_mut()
            .pop_front()
            .expect("unexpected request");
        Ok(IHttpResponse {
            location: None,
            status,
            body: serde_json::to_vec(&body).unwrap(),
        })
    }
}

pub(super) fn client(responses: Vec<(u16, Value)>) -> (IClient, Rc<ITransportFixture>) {
    let server = p::generate_device_keys(p::random_bytes);
    let keys = p::generate_device_keys(p::random_bytes);
    let transport = Rc::new(ITransportFixture {
        server: server.clone(),
        requests: RefCell::default(),
        responses: RefCell::new(responses.into()),
    });
    let client = create_client(IClientOptions {
        address: "https://server.example".into(),
        pin: p::server_pin(&server.recovery.obj_pub).unwrap(),
        vault_id: [0; 32],
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
        req_sk: keys.req_sk,
        version: crate::version::VERSION.into(),
        now: Rc::new(|| 42),
        transport: transport.clone(),
        proof: None,
        unlock: None,
        backoff: Rc::new(|_| panic!("unexpected pause")),
    });
    (client, transport)
}

#[test]
fn waited_slots_are_fetched_again_and_pending_is_not_found() {
    use envden_core::errors::ErrorCode;
    for slot in ["KE1", "KE2", "PairJoiner"] {
        for (second, expected) in [
            (
                json!({"message":"second","expiresAt":100}),
                Ok("second".into()),
            ),
            (
                json!({"kind":"pending","expiresAt":100}),
                Err(ErrorCode::NotFound),
            ),
        ] {
            let (client, transport) = client(vec![
                (200, json!({"message":"first","expiresAt":100})),
                (200, second),
            ]);
            let path = format!("/v1/pairing/mailboxes/7/{slot}");
            assert_eq!(
                super::exchange::wait_slot(&client, &path, || 42, 100).map_err(|e| e.code),
                expected
            );
            assert_eq!(
                *transport.requests.borrow(),
                vec![("GET".into(), path.clone()), ("GET".into(), path)]
            );
        }
    }
}
