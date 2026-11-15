use super::{Candidate, Fixture};
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use envden_core::adapters::storage::IStoredDevice;
use envden_protocol::protocol::*;
use envden_server::http::encoding::text;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::atomic::Ordering;
use tower::ServiceExt;

impl Fixture {
    pub fn now(&self) -> u64 {
        self.time.load(Ordering::SeqCst)
    }
    pub fn advance(&self, ms: u64) {
        self.time.fetch_add(ms, Ordering::SeqCst);
    }
    pub fn fresh(&self) {
        self.options
            .storage
            .put_device(
                &self.vault,
                &self.member.record.id,
                &IStoredDevice {
                    unlocked_until: self.now() + 10000,
                    fresh_until: self.now() + 10000,
                    client_version: "1.0.0".into(),
                    ..Default::default()
                },
            )
            .unwrap();
    }
    pub fn request(
        &self,
        path: &str,
        method: &str,
        body: &[u8],
        who: &Candidate,
        mutate: impl FnOnce(&mut IRequest),
    ) -> Request<Body> {
        let mut r = IRequest {
            server_pin: server_pin(&self.options.server_keys.public_key).unwrap(),
            vault_id: self.vault,
            method: method.into(),
            path_and_query: path.into(),
            body_hash: Sha256::digest(body).into(),
            time: self.now(),
            nonce: random_bytes(),
            device: who.record.id,
            client_version: "1.0.0".into(),
        };
        mutate(&mut r);
        let signed = sign_request(r.clone(), &who.keys.req_sk).unwrap();
        Request::builder()
            .method(method)
            .uri(path)
            .header("content-type", "application/json")
            .header("content-length", body.len())
            .header("envden-request", text(&encode(&r).unwrap()))
            .header("envden-device", text(&r.device))
            .header("envden-time", r.time.to_string())
            .header("envden-nonce", text(&r.nonce))
            .header("envden-body-hash", text(&r.body_hash))
            .header("envden-signature", text(&signed.signature))
            .header("envden-device-record", text(&encode(&who.record).unwrap()))
            .body(Body::from(body.to_vec()))
            .unwrap()
    }
    pub async fn send(
        &self,
        path: &str,
        method: &str,
        body: Value,
        who: &Candidate,
    ) -> (u16, Value) {
        let body = if body.is_null() {
            vec![]
        } else {
            serde_json::to_vec(&body).unwrap()
        };
        self.run(self.request(path, method, &body, who, |_| {}))
            .await
    }
    pub async fn run(&self, request: Request<Body>) -> (u16, Value) {
        let response = self.app.clone().oneshot(request).await.unwrap();
        let status = response.status().as_u16();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (
            status,
            serde_json::from_slice(&body)
                .unwrap_or_else(|_| serde_json::to_value(body.to_vec()).unwrap()),
        )
    }
}

pub fn token_request(
    f: &Fixture,
    path: &str,
    method: &str,
    bytes: &[u8],
    who: &Candidate,
    kind: TTokenKind,
    key: &[u8; 32],
) -> Request<Body> {
    let mut request = f.request(path, method, bytes, who, |_| {});
    let r: IRequest = decode(
        &envden_server::http::encoding::binary(
            request.headers()["envden-request"].to_str().unwrap(),
            None,
        )
        .unwrap(),
    )
    .unwrap();
    request.headers_mut().insert(
        "envden-proof",
        text(&token_proof(kind, key, &r).unwrap()).parse().unwrap(),
    );
    request
}
