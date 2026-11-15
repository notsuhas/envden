use super::*;

#[test]
fn remaining_known_answers() {
    use hmac::{Hmac, Mac};
    let v = vector("known.json");
    let x = &v["hmac"];
    let mut mac = Hmac::<Sha256>::new_from_slice(&b(&x["key"])).unwrap();
    mac.update(x["message"].as_str().unwrap().as_bytes());
    assert_eq!(mac.finalize().into_bytes().as_slice(), b(&x["hash"]));
    let x = &v["argon2id"];
    let mut out = [0; 32];
    argon2::Argon2::new(
        argon2::Algorithm::Argon2id,
        argon2::Version::V0x13,
        argon2::Params::new(256, 2, 1, Some(32)).unwrap(),
    )
    .hash_password_into(b"password", b"somesalt", &mut out)
    .unwrap();
    assert_eq!(out, f::<32>(&x["hash"]));
    use hpke::{
        Deserializable, Kem, OpModeS, Serializable, aead::ChaCha20Poly1305, kdf::HkdfSha256,
        kem::X25519HkdfSha256,
    };
    let x = &v["hpke"];
    let pk = <X25519HkdfSha256 as Kem>::PublicKey::from_bytes(&b(&x["pkRm"])).unwrap();
    let sk = <X25519HkdfSha256 as Kem>::PrivateKey::from_bytes(&b(&x["skEm"])).unwrap();
    let (enc, mut s) = hpke::setup_sender_with_ephemeral::<ChaCha20Poly1305, HkdfSha256>(
        &OpModeS::Base,
        &pk,
        &b(&x["info"]),
        sk,
    )
    .unwrap();
    assert_eq!(enc.to_bytes().as_slice(), b(&x["enc"]));
    assert_eq!(s.seal(&b(&x["pt"]), &b(&x["aad"])).unwrap(), b(&x["ct"]));
}
