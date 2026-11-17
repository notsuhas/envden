use crate::support::Fixture;
use envden_server::http::encoding::text;
use serde_json::{Value, json};

#[tokio::test]
async fn signed_request_rejections_match_reference_inputs_status_and_body() {
    let f = Fixture::new();
    f.fresh();
    let path = "/v1/settings/unlock-period";
    let body = br#"{"period":null}"#;
    for (name, status, code) in [
        ("pin", 401, "UNAUTHORIZED"),
        ("past", 401, "UNAUTHORIZED"),
        ("future", 401, "UNAUTHORIZED"),
        ("method", 401, "UNAUTHORIZED"),
        ("query", 401, "UNAUTHORIZED"),
        ("version", 426, "CLIENT_TOO_OLD"),
        ("vault", 404, "NOT_FOUND"),
        ("body", 401, "UNAUTHORIZED"),
    ] {
        let request = f.request(path, "PUT", body, &f.member, |r| match name {
            "pin" => r.server_pin = [0; 32],
            "past" => r.time -= 300001,
            "future" => r.time += 300001,
            "method" => r.method = "GET".into(),
            "query" => r.path_and_query += "?other",
            "version" => r.client_version = "0.9.9".into(),
            "vault" => r.vault_id = [9; 32],
            "body" => r.body_hash = [0; 32],
            _ => unreachable!(),
        });
        assert_eq!(
            f.run(request).await,
            (status, json!({"error":code})),
            "{name}"
        );
    }
}

#[tokio::test]
async fn signature_replay_missing_headers_and_nonmember_gating() {
    let f = Fixture::new();
    f.fresh();
    let path = "/v1/settings/unlock-period";
    let body = br#"{"period":null}"#;
    let mut bad = f.request(path, "PUT", body, &f.member, |_| {});
    bad.headers_mut()
        .insert("envden-signature", text(&[0; 64]).parse().unwrap());
    assert_eq!(f.run(bad).await, (401, json!({"error":"UNAUTHORIZED"})));
    let nonce = [9; 16];
    for expected in [200, 401] {
        let r = f.request(path, "PUT", body, &f.member, |r| r.nonce = nonce);
        let value = if expected == 200 {
            json!({"period":null})
        } else {
            json!({"error":"UNAUTHORIZED"})
        };
        assert_eq!(f.run(r).await, (expected, value));
    }
    let mut r = f.request(path, "PUT", body, &f.member, |_| {});
    r.headers_mut().remove("envden-device");
    assert_eq!(f.run(r).await, (400, json!({"error":"INVALID_INPUT"})));
    assert_eq!(
        f.send(path, "PUT", json!({"period":null}), &f.joiner).await,
        (403, json!({"error":"NOT_MEMBER"}))
    );
}

#[tokio::test]
async fn zero_vault_is_rejected_and_unknown_devices_do_not_record_nonces() {
    let f = Fixture::new();
    assert_eq!(
        f.run(f.request("/v1/head", "GET", &[], &f.member, |r| r.vault_id = [0; 32]))
            .await,
        (404, json!({"error":"NOT_FOUND"}))
    );
    assert_eq!(
        f.run(f.request("/v1/head", "GET", &[], &f.joiner, |r| r.nonce = [8; 16]))
            .await,
        (401, json!({"error":"UNAUTHORIZED"}))
    );
    assert!(
        f.options
            .storage
            .remember_nonce(&f.joiner.record.id, &[8; 16], f.now())
            .unwrap()
    );
    assert_eq!(
        f.send("/v1/settings/unlock-period", "GET", Value::Null, &f.member)
            .await,
        (403, json!({"error":"LOCKED"}))
    );
}

#[tokio::test]
async fn access_errors_precede_malformed_proof() {
    let f = Fixture::new();
    for (unknown, status, code) in [(true, 404, "NOT_FOUND"), (false, 403, "NOT_MEMBER")] {
        let mut request = f.request("/v1/settings/unlock-period", "GET", &[], &f.joiner, |r| {
            if unknown {
                r.vault_id = [9; 32];
            }
        });
        request
            .headers_mut()
            .insert("envden-proof", "!".parse().unwrap());
        assert_eq!(f.run(request).await, (status, json!({"error": code})));
    }
}

#[tokio::test]
async fn signed_query_binding_uses_whatwg_canonical_spelling() {
    for (wire, canonical) in [
        ("/v1/head?", "/v1/head"),
        ("/v1/head?x='", "/v1/head?x=%27"),
        (
            "/v1/head?x=%2f&x=a+b&y=%2527",
            "/v1/head?x=%2f&x=a+b&y=%2527",
        ),
    ] {
        let f = Fixture::new();
        f.fresh();
        let accepted = f.request(wire, "GET", &[], &f.member, |r| {
            r.path_and_query = canonical.into()
        });
        assert_eq!(f.run(accepted).await.0, 200, "{wire}");
        if wire != canonical {
            let raw = f.request(wire, "GET", &[], &f.member, |_| {});
            assert_eq!(
                f.run(raw).await,
                (401, json!({"error":"UNAUTHORIZED"})),
                "{wire}"
            );
        }
    }
}

#[tokio::test]
async fn signed_query_binding_keeps_encoding_and_parameter_order() {
    let f = Fixture::new();
    f.fresh();
    let wire = "/v1/head?x=%2f&x=a+b&y=%2527";
    for spelling in ["/v1/head?x=/&x=a%20b&y=%27", "/v1/head?x=a+b&x=%2f&y=%2527"] {
        let request = f.request(wire, "GET", &[], &f.member, |r| {
            r.path_and_query = spelling.into()
        });
        assert_eq!(f.run(request).await, (401, json!({"error":"UNAUTHORIZED"})));
    }
}
