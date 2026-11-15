use super::*;

#[test]
fn protocol_compositions() {
    let v = vector("protocol.json");
    let key = f(&v["key"]);
    let vault = f(&v["vaultId"]);
    let secret = f(&v["secret"]);
    let nonce = std::array::from_fn(|i| i as u8);
    let c = IFileContext {
        vault_id: vault,
        epoch: 1,
        file_id: f(&v["fileId"]),
        version: 1,
    };
    let file = IFile {
        repo_id: "repo".into(),
        path: "folder/.env".into(),
        content: b"SECRET=value\n".to_vec(),
    };
    let name = IFileName {
        repo_id: file.repo_id.clone(),
        path: file.path.clone(),
    };
    let boxed = seal_file(&file, &key, &c, &nonce).unwrap();
    assert_eq!(boxed, b(&v["fileBox"]));
    assert_eq!(
        seal_file_name(&name, &key, &c, &nonce).unwrap(),
        b(&v["fileNameBox"])
    );
    assert_eq!(
        open_file_name(&b(&v["fileNameBox"]), &key, &key, &c).unwrap(),
        name
    );
    assert_eq!(
        open_file(&boxed, &key, &key, &c, &h("blob", &boxed), &name).unwrap(),
        file
    );
    let ring = IKeyring {
        vault_id: vault,
        epoch: 1,
        id_key: key,
        older: vec![],
    };
    let boxed = seal_keyring(&ring, &key, &nonce).unwrap();
    assert_eq!(boxed, b(&v["keyringBox"]));
    assert_eq!(
        open_keyring(
            &boxed,
            &key,
            &vault,
            1,
            &[(1, key_commit(&key, &vault, 1))].into(),
            Some(&key)
        )
        .unwrap(),
        ring
    );
    let env = IEnvelope {
        vault_id: vault,
        recovery_enc_sk: key,
        recovery_obj_sk: key,
        checkpoint: [0; 32],
        sealed_at: 1,
    };
    let boxed = seal_envelope(&env, "password", &secret, &secret, &nonce).unwrap();
    assert_eq!(boxed, b(&v["envelopeBox"]));
    assert_eq!(
        open_envelope(&boxed, "password", &secret, &vault).unwrap(),
        env
    );
    assert_eq!(
        kdf(
            &[
                password_key("password", &secret).unwrap().as_slice(),
                &secret
            ]
            .concat(),
            &vault,
            "envelope-key",
            &[]
        ),
        f::<32>(&v["envelopeKey"])
    );
    let wrap = seal_wrap(&key, &vault, 1, &f(&v["deviceId"]), &f(&v["xPublic"]), &key).unwrap();
    assert_eq!(wrap.enc, f::<32>(&v["wrap"]["enc"]));
    assert_eq!(wrap.ct, b(&v["wrap"]["ct"]));
    assert_eq!(
        open_wrap(
            &wrap,
            &key,
            &f(&v["xPublic"]),
            &vault,
            1,
            &key_commit(&key, &vault, 1)
        )
        .unwrap(),
        key
    );
    assert!(seal_wrap(&key, &vault, 1, &[0; 16], &[0; 32], &key).is_err());
    let r = IRequest {
        server_pin: f(&v["serverPin"]),
        vault_id: vault,
        method: "POST".into(),
        path_and_query: "/swap".into(),
        body_hash: Sha256::digest(key).into(),
        time: 1,
        nonce: secret,
        device: f(&v["deviceId"]),
        client_version: "1.0.0".into(),
    };
    assert_eq!(
        token_proof(
            TTokenKind::Setup,
            &token_key(TTokenKind::Setup, &[7; 20]),
            &r
        )
        .unwrap(),
        f::<32>(&v["setupProof"])
    );
    assert_eq!(
        token_proof(
            TTokenKind::Repair,
            &token_key(TTokenKind::Repair, &[7; 20]),
            &r
        )
        .unwrap(),
        f::<32>(&v["repairProof"])
    );
    assert_eq!(
        sign_sk_proof(&secret, &vault, &r).unwrap(),
        f::<64>(&v["skProof"])
    );
    assert_eq!(
        encode_token(TTokenKind::Setup, &[7; 20], &f(&v["serverPin"])),
        v["setupToken"].as_str().unwrap()
    );
    assert_eq!(
        generate_pairing_code(1, &[0, 1, 2, 3, 4]).unwrap(),
        v["pairingCode"].as_str().unwrap()
    );
}
