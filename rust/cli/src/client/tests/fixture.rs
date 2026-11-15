use super::super::*;
use envden_core::errors::{ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::json;
use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

pub(super) struct Fixture {
    server: p::IDeviceKeys,
    pub(super) attempts: Cell<usize>,
    pub(super) nonces: RefCell<Vec<String>>,
    pub(super) failure: Cell<Option<ErrorCode>>,
    minimum: RefCell<String>,
}

impl ITransport for Fixture {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        if request.url.path() == "/v1/hello" {
            assert_eq!(request.timeout.as_secs(), 2);
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
                    app_version: "1.0.0".into(),
                    min_client: self.minimum.borrow().clone(),
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
        assert_eq!(request.timeout.as_secs(), 15);
        self.attempts.set(self.attempts.get() + 1);
        let value: p::IRequest = p::decode(&binary(&request.headers["Envden-Request"])?)?;
        let record: p::IDeviceRecord =
            p::decode(&binary(&request.headers["Envden-Device-Record"])?)?;
        let signed = p::ISigned {
            body: value,
            signature: binary(&request.headers["Envden-Signature"])?,
        };
        assert!(matches!(
            p::verify_request(
                &signed,
                &record.req_pub,
                &p::server_pin(&self.server.recovery.obj_pub)?,
                &request.body,
                1000000,
                false
            ),
            p::TVerification::Valid(_)
        ));
        self.nonces
            .borrow_mut()
            .push(request.headers["Envden-Nonce"].clone());
        let failure = self.failure.get();
        Ok(IHttpResponse {
            location: None,
            status: if failure.is_some() { 403 } else { 200 },
            body: serde_json::to_vec(
                &failure.map_or(json!({"kind":"ok"}), |e| json!({"error":e.as_str()})),
            )
            .unwrap(),
        })
    }
}

pub(super) fn fixture() -> (IClient, Rc<Fixture>, Rc<RefCell<Vec<u64>>>) {
    let server = p::generate_device_keys(p::random_bytes);
    let keys = p::generate_device_keys(p::random_bytes);
    let pin = p::server_pin(&server.recovery.obj_pub).unwrap();
    let record = p::IDeviceRecord {
        id: p::device_id(
            &keys.recovery.enc_pub,
            &keys.recovery.obj_pub,
            &keys.req_pub,
        ),
        name: "test".into(),
        enc_pub: keys.recovery.enc_pub,
        obj_pub: keys.recovery.obj_pub,
        req_pub: keys.req_pub,
    };
    let transport = Rc::new(Fixture {
        server,
        attempts: Cell::new(0),
        nonces: RefCell::default(),
        failure: Cell::new(None),
        minimum: RefCell::new("0.0.0".into()),
    });
    let delays = Rc::new(RefCell::new(vec![]));
    let wait = delays.clone();
    (
        create_client(IClientOptions {
            address: "https://server.example".into(),
            pin,
            vault_id: [0; 32],
            record,
            req_sk: keys.req_sk,
            version: "1.0.0".into(),
            now: || 1000000,
            transport: transport.clone(),
            proof: None,
            unlock: None,
            backoff: Rc::new(move |ms| wait.borrow_mut().push(ms)),
        }),
        transport,
        delays,
    )
}
