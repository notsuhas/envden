use envden_protocol::protocol::*;
use sha2::{Digest, Sha256};

#[test]
fn reference_request_and_hello_bindings() {
    let sk = [1; 32];
    let keys = generate_device_keys(|| sk);
    let p = keys.recovery;
    let pin = server_pin(&p.obj_pub).unwrap();
    let z = [0; 32];
    let request = IRequest {
        server_pin: pin,
        vault_id: z,
        method: "POST".into(),
        path_and_query: "/swap?a=1".into(),
        body_hash: Sha256::digest(z).into(),
        time: 1000000,
        nonce: [0; 16],
        device: device_id(&p.enc_pub, &p.obj_pub, &keys.req_pub),
        client_version: "1.0.0".into(),
    };
    let signed = sign_request(request.clone(), &sk).unwrap();
    for (time, seen, pin, body, valid) in [
        (1000000, false, pin, z.to_vec(), true),
        (1299999, false, pin, z.to_vec(), true),
        (1300000, false, pin, z.to_vec(), false),
        (700000, false, pin, z.to_vec(), false),
        (1000000, true, pin, z.to_vec(), false),
        (1000000, false, z, z.to_vec(), false),
        (1000000, false, pin, vec![], false),
    ] {
        assert_eq!(
            matches!(
                verify_request(&signed, &keys.req_pub, &pin, &body, time, seen),
                TVerification::Valid(_)
            ),
            valid
        );
    }
    assert!(matches!(
        verify_request_hash(
            &signed,
            &keys.req_pub,
            &pin,
            &request.body_hash,
            1000000,
            false
        ),
        TVerification::Valid(_)
    ));
    assert!(matches!(
        verify_request_hash(&signed, &keys.req_pub, &pin, &z, 1000000, false),
        TVerification::Invalid { .. }
    ));
    let hello = build_hello(
        IServerHello {
            challenge: z,
            host: "server".into(),
            server_sign_pub: p.obj_pub,
            app_version: "1.0.0".into(),
            min_client: "1.0.0".into(),
            protocols: vec![1],
        },
        &sk,
    )
    .unwrap();
    for (host, pin, version, valid) in [
        ("SERVER", pin, "1.0.0", true),
        ("other", pin, "1.0.0", false),
        ("server", pin, "1.0.1", false),
        ("server", z, "1.0.0", false),
    ] {
        assert_eq!(
            matches!(
                verify_hello(&hello, &z, host, &pin, version),
                TVerification::Valid(_)
            ),
            valid
        );
    }
    let setup = token_key(TTokenKind::Setup, &[3; 20]);
    let repair = token_key(TTokenKind::Repair, &[3; 20]);
    assert_ne!(setup, repair);
    let proof = token_proof(TTokenKind::Setup, &setup, &request).unwrap();
    assert!(verify_token_proof(TTokenKind::Setup, &setup, &request, &proof).unwrap());
    assert!(!verify_token_proof(TTokenKind::Repair, &repair, &request, &proof).unwrap());
    let sig = sign_sk_proof(&[0; 16], &z, &request).unwrap();
    let public = sk_pub(&[0; 16], &z);
    assert!(verify_sk_proof(&public, &request, &sig).unwrap());
    assert!(!verify(
        &public,
        "request",
        &encode(&request).unwrap(),
        &sig
    ));
}
