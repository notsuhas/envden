use ed25519_dalek::{Signer, SigningKey};
use envden_protocol::protocol::{crypto::*, files::*, keys::*};
use serde_json::Value;
use sha2::{Digest, Sha256};

fn vectors(name: &str) -> Value {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/vectors")
        .join(name);
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn bytes(value: &Value) -> Vec<u8> {
    hex::decode(value.as_str().unwrap()).unwrap()
}

fn fixed<const N: usize>(value: &Value) -> [u8; N] {
    bytes(value).try_into().unwrap()
}

#[test]
fn protocol_key_identifiers_signatures_and_kdfs() {
    let v = vectors("protocol.json");
    let key: [u8; 32] = fixed(&v["key"]);
    let vault: [u8; 32] = fixed(&v["vaultId"]);
    let secret: [u8; 16] = fixed(&v["secret"]);
    let public = SigningKey::from_bytes(&key).verifying_key().to_bytes();
    let enc = x25519_dalek::x25519(key, x25519_dalek::X25519_BASEPOINT_BYTES);
    assert_eq!(public, fixed::<32>(&v["edPublic"]));
    assert_eq!(enc, fixed::<32>(&v["xPublic"]));
    assert_eq!(
        device_id(&enc, &public, &public),
        fixed::<16>(&v["deviceId"])
    );
    assert_eq!(recovery_id(&enc, &public), fixed::<16>(&v["recoveryId"]));
    assert_eq!(server_pin(&public).unwrap(), fixed::<32>(&v["serverPin"]));
    assert_eq!(sk_pub(&secret, &vault), fixed::<32>(&v["skPub"]));
    assert_eq!(
        encode_secret_key(&secret),
        v["secretText"].as_str().unwrap()
    );
    assert_eq!(
        decode_secret_key(v["secretText"].as_str().unwrap()).unwrap(),
        secret
    );
    assert_eq!(sign(&key, "entry", &key), fixed::<64>(&v["signature"]));
    assert!(verify(&public, "entry", &key, &bytes(&v["signature"])));
    assert!(!verify(&public, "manifest", &key, &bytes(&v["signature"])));
    let id = file_id(&key, "repo", "folder/.env").unwrap();
    assert_eq!(id, fixed::<32>(&v["fileId"]));
    assert_eq!(
        kdf(&key, &vault, "file-key", &id),
        fixed::<32>(&v["fileKey"])
    );
    assert_eq!(
        kdf(&key, &vault, "keyring-key", &1u32.to_be_bytes()),
        fixed::<32>(&v["keyringKey"])
    );
    assert_eq!(h("repair-id", &[7; 20]), fixed::<32>(&v["repairId"]));
}

#[test]
fn published_primitive_vectors() {
    let v = vectors("known.json");
    let ed = &v["ed25519"];
    let key = SigningKey::from_bytes(&fixed(&ed["seed"]));
    assert_eq!(key.verifying_key().to_bytes(), fixed::<32>(&ed["public"]));
    assert_eq!(key.sign(&[]).to_bytes(), fixed::<64>(&ed["signature"]));
    let x = &v["x25519"];
    assert_eq!(
        x25519_dalek::x25519(fixed(&x["secret"]), x25519_dalek::X25519_BASEPOINT_BYTES),
        fixed::<32>(&x["public"])
    );
    let k = &v["hkdf"];
    let mut out = [0; 42];
    hkdf::Hkdf::<Sha256>::new(Some(&bytes(&k["salt"])), &bytes(&k["ikm"]))
        .expand(&bytes(&k["info"]), &mut out)
        .unwrap();
    assert_eq!(out.as_slice(), bytes(&k["okm"]));
    let x = &v["xchacha"];
    let nonce = fixed(&x["nonce"]);
    let boxed = seal_box(
        &fixed(&x["key"]),
        x["message"].as_str().unwrap().as_bytes(),
        &bytes(&x["ad"]),
        &nonce,
    )
    .unwrap();
    assert_eq!(&boxed[25..], bytes(&x["ct"]));
    assert_eq!(
        open_box(&fixed(&x["key"]), &boxed, &bytes(&x["ad"])).unwrap(),
        x["message"].as_str().unwrap().as_bytes()
    );
    assert_eq!(
        Sha256::digest(b"abc").as_slice(),
        hex::decode("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad").unwrap()
    );
}

#[test]
fn strict_key_signature_and_path_rejections() {
    for key in [
        [0; 32],
        {
            let mut k = [0; 32];
            k[0] = 1;
            k
        },
        [255; 32],
    ] {
        assert!(validate_ed_public(&key).is_err());
        assert!(validate_enc_public(&key).is_err());
    }
    let key = [5; 32];
    let public = SigningKey::from_bytes(&key).verifying_key().to_bytes();
    let mut sig = sign(&key, "entry", b"test");
    sig[32..].copy_from_slice(
        &hex::decode("edd3f55c1a631258d69cf7a2def9de1400000000000000000000000000000010").unwrap(),
    );
    assert!(!verify(&public, "entry", b"test", &sig));
    sig[..32].fill(255);
    assert!(!verify(&public, "entry", b"test", &sig));
    for path in [
        "",
        "/.env",
        "a//b",
        "a/../b",
        "a\\b",
        "C:a",
        "CON",
        "com¹.txt",
        "a.",
        "a ",
    ] {
        assert!(validate_path(path).is_err(), "{path}");
    }
    for path in [".env", "a/.env", "conifer", "com0", "COM10", "a/é"] {
        assert!(validate_path(path).is_ok(), "{path}");
    }
}
