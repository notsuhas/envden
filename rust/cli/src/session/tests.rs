use super::*;
use crate::client::*;
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use serde_json::{Value, json};
use std::{cell::RefCell, rc::Rc};

struct Server {
    keys: p::IDeviceKeys,
    setup: String,
    record: RefCell<Option<String>>,
    pending: RefCell<Option<String>>,
    vault: [u8; 32],
}

impl ITransport for Server {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        let input: Value = serde_json::from_slice(&request.body).unwrap_or_default();
        let message = input["message"].as_str().unwrap_or_default().to_owned();
        let ids = p::unlock_identifiers(&self.vault);
        let body = match request.url.path() {
            "/v1/hello" => {
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
                json!({"hello":text(&p::encode(&hello)?)})
            }
            "/v1/opaque/registration/start" => {
                let response =
                    p::opaque_registration_response(p::ICreateServerRegistrationResponseParams {
                        server_setup: self.setup.clone(),
                        user_identifier: ids.user_identifier,
                        registration_request: message,
                    })?;
                json!({"message":response.registration_response})
            }
            "/v1/opaque/registration/finish" => {
                *self.record.borrow_mut() = Some(message);
                json!({"kind":"registered"})
            }
            "/v1/opaque/login/start" => {
                let response = p::opaque_server_start_login(p::IStartServerLoginParams {
                    server_setup: self.setup.clone(),
                    registration_record: self.record.borrow().clone(),
                    start_login_request: message,
                    user_identifier: ids.user_identifier,
                    identifiers: Some(ids.identifiers),
                })?;
                *self.pending.borrow_mut() = Some(response.server_login_state);
                json!({"message":response.login_response})
            }
            "/v1/opaque/login/finish" => {
                p::opaque_server_finish_login(p::IFinishServerLoginParams {
                    identifiers: Some(ids.identifiers),
                    server_login_state: self.pending.borrow_mut().take().unwrap(),
                    finish_login_request: message,
                })?;
                if input["purpose"] == "kit" {
                    json!({"kind":"ticket"})
                } else {
                    json!({"kind":"unlocked","unlockedUntil":null,"freshUntil":123})
                }
            }
            "/v1/unlock-window" => json!({"unlockedUntil":null,"freshUntil":456}),
            _ => panic!("unexpected path"),
        };
        Ok(IHttpResponse {
            status: 200,
            location: None,
            body: serde_json::to_vec(&body).unwrap(),
        })
    }
}

#[test]
fn opaque_registration_login_retries_tickets_and_window() {
    let server = Rc::new(Server {
        keys: p::generate_device_keys(p::random_bytes),
        setup: p::opaque_create_setup(),
        record: RefCell::new(None),
        pending: RefCell::new(None),
        vault: [3; 32],
    });
    let keys = p::generate_device_keys(p::random_bytes);
    let client = create_client(IClientOptions {
        address: "https://server.test".into(),
        pin: p::server_pin(&server.keys.recovery.obj_pub).unwrap(),
        vault_id: server.vault,
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
        version: "1.0.0".into(),
        now: || 0,
        transport: server,
        proof: None,
        unlock: None,
        backoff: Rc::new(|_| panic!("unexpected backoff")),
    });
    register_password(&client, &[3; 32], "test password").unwrap();
    assert_eq!(
        login(
            &client,
            &[3; 32],
            TPassword::Fixed("wrong"),
            p::TLoginPurpose::Unlock
        )
        .unwrap_err()
        .message,
        "Wrong master password"
    );
    let mut calls = 0;
    let mut prompt = |retry| {
        calls += 1;
        assert_eq!(retry, calls > 1);
        Ok(if retry { "test password" } else { "wrong" }.into())
    };
    let window = login(
        &client,
        &[3; 32],
        TPassword::Prompt(&mut prompt),
        p::TLoginPurpose::Unlock,
    )
    .unwrap()
    .unwrap();
    assert_eq!(calls, 2);
    assert_eq!(window.fresh_until, 123);
    assert_eq!(window.unlocked_until, None);
    assert!(
        login(
            &client,
            &[3; 32],
            TPassword::Fixed("test password"),
            p::TLoginPurpose::Kit
        )
        .unwrap()
        .is_none()
    );
    let mut state = json!({});
    record_unlock_window(&client, &mut state).unwrap();
    assert_eq!(
        state["session"],
        json!({"unlockedUntil":null,"freshUntil":456})
    );
}
