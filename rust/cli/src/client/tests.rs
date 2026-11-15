use super::*;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::json;
use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

struct Fixture {
    server: p::IDeviceKeys,
    attempts: Cell<usize>,
    nonces: RefCell<Vec<String>>,
    failure: Cell<Option<ErrorCode>>,
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

fn fixture() -> (IClient, Rc<Fixture>, Rc<RefCell<Vec<u64>>>) {
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

#[test]
fn exact_body_query_signatures_and_locked_retry() {
    let (mut client, transport, _) = fixture();
    transport.failure.set(Some(ErrorCode::Locked));
    let unlock = transport.clone();
    client.options.unlock = Some(Rc::new(move || {
        unlock.failure.set(None);
        Ok(())
    }));
    client
        .request("/v1/test?q=1", "POST", Some(&json!({"message":"test"})))
        .unwrap();
    assert_eq!(transport.attempts.get(), 2);
    assert_eq!(
        client
            .request("https://other.example/", "GET", None)
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
}

#[test]
fn busy_retries_have_fresh_nonces_and_bounded_backoff() {
    let (client, transport, delays) = fixture();
    transport.failure.set(Some(ErrorCode::Busy));
    assert_eq!(
        client.request("/v1/head", "GET", None).unwrap_err().code,
        ErrorCode::Busy
    );
    assert_eq!(*delays.borrow(), [100, 200]);
    let mut nonces = transport.nonces.borrow().clone();
    nonces.sort();
    nonces.dedup();
    assert_eq!(nonces.len(), 3);
}

#[test]
fn kit_required_never_unlocks_and_binary_transport_signs_bytes() {
    let (mut client, transport, _) = fixture();
    client
        .request_bytes("/v1/swap", "POST", &[1, 2, 3])
        .unwrap();
    transport.failure.set(Some(ErrorCode::RecoveryKitRequired));
    client.options.unlock = Some(Rc::new(|| panic!("must not unlock")));
    assert_eq!(
        client.request("/v1/head", "GET", None).unwrap_err().code,
        ErrorCode::RecoveryKitRequired
    );
    assert_eq!(transport.attempts.get(), 2);
}

#[test]
fn hello_rejects_wrong_pin_and_newer_minimum() {
    let (client, transport, _) = fixture();
    assert_eq!(
        hello(
            &client.options.address,
            Some(&[0; 32]),
            &*transport,
            "0.0.0"
        )
        .err()
        .unwrap()
        .code,
        ErrorCode::Unauthorized
    );
    assert_eq!(
        hello(&client.options.address, None, &*transport, "2.0.0")
            .err()
            .unwrap()
            .code,
        ErrorCode::ServerTooOld
    );
}

#[test]
fn errors_and_encoding_match_reference() {
    for (value, path, code, message) in [
        (
            json!({"error":"SERVER_UNREACHABLE"}),
            "",
            ErrorCode::ServerUnreachable,
            "Server can't reach its storage. Try again later",
        ),
        (
            json!({"error":"MADE_UP"}),
            "",
            ErrorCode::InvalidData,
            "Invalid server response",
        ),
        (
            json!({"error":"CONFLICT"}),
            "/v1/pairing/mailboxes/4/a",
            ErrorCode::Conflict,
            "Pairing code expired or already used. Run envden device add for a new one",
        ),
    ] {
        let error = response_error(&value, path);
        assert_eq!(error.code, code);
        assert_eq!(error.message, message);
    }
    assert!(binary("AA==").is_err());
    assert!(binary("AB").is_err());
    assert_eq!(binary(&text(&[0, 255])).unwrap(), [0, 255]);
    let mut calls = 0;
    assert!(
        retry_head::<()>(|| {
            calls += 1;
            Err(EnvdenError::new(ErrorCode::HeadMoved, "moved"))
        })
        .is_err()
    );
    assert_eq!(calls, 3);
}
