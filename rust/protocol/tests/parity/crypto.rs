use envden_core::errors::ErrorCode;
use envden_protocol::protocol::*;
use serde_json::Value;

fn vector() -> Value {
    serde_json::from_str(include_str!("../fixtures/vectors/protocol.json")).unwrap()
}
fn fixed<const N: usize>(v: &Value) -> [u8; N] {
    hex::decode(v.as_str().unwrap())
        .unwrap()
        .try_into()
        .unwrap()
}

#[test]
fn reference_box_wrap_and_file_failures() {
    let v = vector();
    let key = fixed(&v["key"]);
    let vault = fixed(&v["vaultId"]);
    let id = fixed(&v["deviceId"]);
    let public = fixed(&v["xPublic"]);
    assert!(!verify(&fixed(&v["edPublic"]), "entry", &key, &[0; 63]));
    let nonce = std::array::from_fn(|i| i as u8);
    let boxed = seal_box(&key, &key, &[], &nonce).unwrap();
    let e = open_box(&[0; 32], &boxed, &[]).unwrap_err();
    assert_eq!(e.code, ErrorCode::InvalidData);
    assert_eq!(e.message, "Unable to decrypt box");
    assert!(e.source.is_some());
    let low = hex::decode("e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800")
        .unwrap()
        .try_into()
        .unwrap();
    for public in [[0; 32], low] {
        let e = seal_wrap(&key, &vault, 1, &id, &public, &key).unwrap_err();
        assert_eq!(e.code, ErrorCode::InvalidData);
        assert!(e.source.is_some());
    }
    let wrap = seal_wrap(&key, &vault, 1, &id, &public, &key).unwrap();
    let commit = key_commit(&key, &vault, 1);
    let e = open_wrap(&wrap, &[0; 32], &public, &vault, 1, &commit).unwrap_err();
    assert_eq!(e.code, ErrorCode::InvalidData);
    assert_eq!(e.message, "Unable to decrypt wrap");
    assert!(e.source.is_some());
    assert!(open_wrap(&wrap, &key, &public, &vault, 1, &[0; 32]).is_err());
    let file: IFile = IFile {
        repo_id: "repo".into(),
        path: "folder/.env".into(),
        content: b"SECRET=value\n".to_vec(),
    };
    let context = IFileContext {
        vault_id: vault,
        epoch: 1,
        file_id: fixed(&v["fileId"]),
        version: 1,
    };
    let box_data = hex::decode(v["fileBox"].as_str().unwrap()).unwrap();
    let name = open_file_name(
        &hex::decode(v["fileNameBox"].as_str().unwrap()).unwrap(),
        &key,
        &key,
        &context,
    )
    .unwrap();
    let hash = h("blob", &box_data);
    assert_eq!(
        open_file(&box_data, &key, &key, &context, &hash, &name).unwrap(),
        file
    );
    assert!(
        open_file(
            &box_data,
            &key,
            &key,
            &IFileContext {
                version: 2,
                vault_id: context.vault_id,
                epoch: context.epoch,
                file_id: context.file_id
            },
            &hash,
            &name
        )
        .is_err()
    );
    assert!(open_file(&box_data, &key, &[0; 32], &context, &hash, &name).is_err());
    assert!(open_file(&box_data, &key, &key, &context, &[0; 32], &name).is_err());
    assert!(
        open_file(
            &box_data,
            &key,
            &key,
            &context,
            &hash,
            &IFileName {
                path: "other".into(),
                ..name
            }
        )
        .is_err()
    );
    let name_box = hex::decode(v["fileNameBox"].as_str().unwrap()).unwrap();
    assert!(open_file_name(&name_box, &key, &[0; 32], &context).is_err());
    let ring = hex::decode(v["keyringBox"].as_str().unwrap()).unwrap();
    let commits = [(1, key_commit(&key, &vault, 1))].into();
    assert!(open_keyring(&ring, &key, &vault, 1, &Default::default(), None).is_err());
    assert!(open_keyring(&ring, &key, &vault, 1, &commits, Some(&[0; 32])).is_err());
    let env = hex::decode(v["envelopeBox"].as_str().unwrap()).unwrap();
    let secret = fixed(&v["secret"]);
    let error = open_envelope(&env, "wrong", &secret, &vault).unwrap_err();
    assert_eq!(error.code, ErrorCode::InvalidData);
    assert!(error.source.is_some());
    assert!(open_envelope(&env, "password", &[0; 16], &vault).is_err());
}

#[test]
fn reference_server_data_bounds() {
    for (length, valid) in [(4266910, true), (4266911, false)] {
        assert_eq!(
            serde_json::from_value::<IObjectsResponse>(
                serde_json::json!({"objects":["A".repeat(length)]})
            )
            .is_ok(),
            valid
        );
    }
    for (length, valid) in [(43, true), (44, false)] {
        assert_eq!(
            serde_json::from_value::<IRepairStatus>(
                serde_json::json!({"restoredHead":"A".repeat(length),"repairId":"A"})
            )
            .is_ok(),
            valid
        );
    }
}
