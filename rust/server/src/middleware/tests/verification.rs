use crate::{
    http::{encoding::text, types::IAppOptions},
    identity::load_server_keys,
    middleware::verify_headers,
};
use axum::http::{HeaderMap, Method, Uri};
use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::errors::ErrorCode;
use envden_protocol::protocol::*;
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};

fn request(
    time: u64,
    pin_override: Option<[u8; 32]>,
    version: &str,
) -> (tempfile::TempDir, IAppOptions, HeaderMap) {
    let directory = tempfile::tempdir().unwrap();
    let server_keys = load_server_keys(directory.path()).unwrap();
    let keys = generate_device_keys(random_bytes);
    let device = device_id(
        &keys.recovery.enc_pub,
        &keys.recovery.obj_pub,
        &keys.req_pub,
    );
    let record = IDeviceRecord {
        id: device,
        name: "alpha".into(),
        enc_pub: keys.recovery.enc_pub,
        obj_pub: keys.recovery.obj_pub,
        req_pub: keys.req_pub,
    };
    let request = IRequest {
        server_pin: pin_override.unwrap_or_else(|| server_pin(&server_keys.public_key).unwrap()),
        vault_id: [1; 32],
        method: "GET".into(),
        path_and_query: "/v1/head".into(),
        body_hash: Sha256::digest([]).into(),
        time,
        nonce: [2; 16],
        device,
        client_version: version.into(),
    };
    let signed = sign_request(request.clone(), &keys.req_sk).unwrap();
    let mut headers = HeaderMap::new();
    for (name, value) in [
        ("envden-request", text(&encode(&request).unwrap())),
        ("envden-signature", text(&signed.signature)),
        ("envden-device", text(&device)),
        ("envden-time", time.to_string()),
        ("envden-nonce", text(&request.nonce)),
        ("envden-body-hash", text(&request.body_hash)),
        ("envden-device-record", text(&encode(&record).unwrap())),
    ] {
        headers.insert(
            axum::http::HeaderName::from_static(name),
            value.parse().unwrap(),
        );
    }
    let options = IAppOptions {
        storage: Arc::new(create_sqlite_storage_adapter(directory.path(), 1000000).unwrap()),
        storage_lock: Arc::new(Mutex::new(())),
        now: Arc::new(|| 1000000),
        server_keys,
        app_version: "1.0.0".into(),
        min_client: "0.0.0".into(),
    };

    (directory, options, headers)
}

#[test]
fn valid_signed_nonmember_request() {
    let (_directory, options, headers) = request(1000000, None, "1.0.0");
    assert!(
        !verify_headers(
            &options,
            &Method::GET,
            &Uri::from_static("/v1/head"),
            &headers
        )
        .unwrap()
        .member
    );
}

#[test]
fn signing_time_window_is_strict_on_both_edges() {
    for (time, ok) in [
        (700000, false),
        (700001, true),
        (1299999, true),
        (1300000, false),
    ] {
        let (_directory, options, headers) = request(time, None, "1.0.0");
        assert_eq!(
            verify_headers(
                &options,
                &Method::GET,
                &Uri::from_static("/v1/head"),
                &headers
            )
            .is_ok(),
            ok,
            "{time}"
        );
    }
}

mod signatures;
