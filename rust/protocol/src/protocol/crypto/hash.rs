use crate::protocol::encoding::ctx;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

pub fn frame(label: &str, message: &[u8]) -> Vec<u8> {
    [
        ctx(label).as_slice(),
        &(message.len() as u64).to_be_bytes(),
        message,
    ]
    .concat()
}

pub fn h(label: &str, message: &[u8]) -> [u8; 32] {
    Sha256::digest(frame(label, message)).into()
}

pub fn mac(key: &[u8], label: &str, message: &[u8]) -> [u8; 32] {
    let mut m = Hmac::<Sha256>::new_from_slice(key).expect("any key length");
    m.update(&frame(label, message));
    m.finalize().into_bytes().into()
}

pub fn kdf(ikm: &[u8], salt: &[u8], label: &str, extra: &[u8]) -> [u8; 32] {
    let mut out = [0; 32];
    hkdf::Hkdf::<Sha256>::new(Some(salt), ikm)
        .expand(&[ctx(label), extra.to_vec()].concat(), &mut out)
        .expect("fixed output length");
    out
}
