use envden_protocol::protocol::*;
use std::collections::BTreeMap;
#[test]
fn pair_messages_reject_cross_type_wrong_keys_and_oversize() {
    let keys = generate_device_keys(|| [1; 32]);
    let k = keys.recovery;
    let device = IDeviceRecord {
        id: device_id(&k.enc_pub, &k.obj_pub, &keys.req_pub),
        name: "joiner".into(),
        enc_pub: k.enc_pub,
        obj_pub: k.obj_pub,
        req_pub: keys.req_pub,
    };
    let v = IPairJoiner { device };
    let b = seal_pair_joiner(&v, &[0; 32], &[0; 24]).unwrap();
    assert_eq!(open_pair_joiner(&b, &[0; 32]).unwrap(), v);
    assert!(open_pair_approver(&b, &[0; 32]).is_err());
    assert!(open_pair_joiner(&b, &[1; 32]).is_err());
    assert!(open_pair_joiner(&[0; 4097], &[0; 32]).is_err());
    let a = IPairApprover {
        vault_id: [0; 32],
        server_pin: [0; 32],
        manifest_hash: [0; 32],
    };
    let b = seal_pair_approver(&a, &[0; 32], &[1; 24]).unwrap();
    assert_eq!(open_pair_approver(&b, &[0; 32]).unwrap(), a);
    assert!(open_pair_joiner(&b, &[0; 32]).is_err());
}
#[test]
fn keyring_checks_all_commits_identity_and_nested_epochs() {
    let v = IKeyring {
        vault_id: [1; 32],
        epoch: 2,
        id_key: [2; 32],
        older: vec![IOlderKey {
            epoch: 1,
            key: [3; 32],
        }],
    };
    let b = seal_keyring(&v, &[4; 32], &[0; 24]).unwrap();
    let commits: BTreeMap<_, _> = [
        (1, key_commit(&[3; 32], &v.vault_id, 1)),
        (2, key_commit(&[4; 32], &v.vault_id, 2)),
    ]
    .into();
    assert_eq!(
        open_keyring(&b, &[4; 32], &v.vault_id, 2, &commits, Some(&v.id_key)).unwrap(),
        v
    );
    for epoch in [1, 2] {
        let mut c = commits.clone();
        c.remove(&epoch);
        assert!(open_keyring(&b, &[4; 32], &v.vault_id, 2, &c, None).is_err());
    }
    assert!(open_keyring(&b, &[4; 32], &v.vault_id, 2, &commits, Some(&[0; 32])).is_err());
    let mut invalid = v;
    invalid.older[0].epoch = 2;
    assert!(encode(&invalid).is_err());
}
#[test]
fn hpke_rejects_low_order_wrong_key_commit_and_ciphertext() {
    let sk = [5; 32];
    let pk = x25519_dalek::x25519(sk, x25519_dalek::X25519_BASEPOINT_BYTES);
    for low in [[0; 32], {
        let mut k = [0; 32];
        k[0] = 1;
        k
    }] {
        let e = seal_wrap(&[2; 32], &[3; 32], 1, &[4; 16], &low, &[6; 32]).unwrap_err();
        assert!(e.source.is_some());
        assert_eq!(e.message, "Unable to encrypt wrap");
    }
    let w = seal_wrap(&[2; 32], &[3; 32], 1, &[4; 16], &pk, &[6; 32]).unwrap();
    let commit = key_commit(&[2; 32], &[3; 32], 1);
    let e = open_wrap(&w, &[0; 32], &pk, &[3; 32], 1, &commit).unwrap_err();
    assert!(e.source.is_some());
    assert_eq!(e.message, "Unable to decrypt wrap");
    assert!(open_wrap(&w, &sk, &pk, &[3; 32], 1, &[0; 32]).is_err());
    let mut damaged = w;
    damaged.ct[0] ^= 1;
    assert!(open_wrap(&damaged, &sk, &pk, &[3; 32], 1, &commit).is_err());
}
#[test]
fn file_boxes_bind_every_context_field_and_identity() {
    let key = [1; 32];
    let id = [2; 32];
    let name = IFileName {
        repo_id: "repo".into(),
        path: ".env".into(),
    };
    let v = IFile {
        repo_id: name.repo_id.clone(),
        path: name.path.clone(),
        content: b"value".to_vec(),
    };
    let c = IFileContext {
        vault_id: [3; 32],
        epoch: 1,
        file_id: file_id(&id, &name.repo_id, &name.path).unwrap(),
        version: 1,
    };
    let b = seal_file(&v, &key, &c, &[0; 24]).unwrap();
    let n = seal_file_name(&name, &key, &c, &[0; 24]).unwrap();
    let hash = h("blob", &b);
    assert_eq!(open_file(&b, &key, &id, &c, &hash, &name).unwrap(), v);
    assert!(open_file(&b, &key, &id, &c, &[0; 32], &name).is_err());
    assert!(open_file_name(&n, &key, &[0; 32], &c).is_err());
    for c in [
        IFileContext {
            vault_id: [0; 32],
            epoch: 1,
            file_id: c.file_id,
            version: 1,
        },
        IFileContext {
            vault_id: c.vault_id,
            epoch: 2,
            file_id: c.file_id,
            version: 1,
        },
        IFileContext {
            vault_id: c.vault_id,
            epoch: 1,
            file_id: c.file_id,
            version: 2,
        },
    ] {
        assert!(open_file(&b, &key, &id, &c, &hash, &name).is_err());
    }
}
#[test]
fn envelope_rejects_wrong_password_secret_and_vault() {
    let v = IEnvelope {
        vault_id: [1; 32],
        recovery_enc_sk: [2; 32],
        recovery_obj_sk: [3; 32],
        checkpoint: [4; 32],
        sealed_at: 1,
    };
    let b = seal_envelope(&v, "password", &[5; 16], &[6; 16], &[7; 24]).unwrap();
    let e = open_envelope(&b, "wrong", &[5; 16], &v.vault_id).unwrap_err();
    assert!(e.source.is_some());
    assert!(open_envelope(&b, "password", &[0; 16], &v.vault_id).is_err());
    assert!(open_envelope(&b, "password", &[5; 16], &[0; 32]).is_err());
}
