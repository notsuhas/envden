use super::{h, sign, verify};
use crate::protocol::{
    codecs::ISigned,
    encoding::{ICodec, encode},
};
use envden_core::errors::Result;

pub fn sign_object<T: ICodec>(body: T, secret: &[u8; 32], label: &str) -> Result<ISigned<T>> {
    let signature = sign(secret, label, &encode(&body)?).to_vec();
    Ok(ISigned { body, signature })
}

pub fn verify_object<T: ICodec>(value: &ISigned<T>, public: &[u8; 32], label: &str) -> bool {
    encode(&value.body).is_ok_and(|b| verify(public, label, &b, &value.signature))
}

pub fn object_hash<T: ICodec>(value: &ISigned<T>, label: &str) -> Result<[u8; 32]> {
    Ok(h(&format!("hash/{label}"), &encode(value)?))
}

pub fn verify_raw_object(raw: &[u8], members: &[([u8; 16], [u8; 32])], label: &str) -> bool {
    if raw.len() < 82 {
        return false;
    }
    let n = raw.len();
    members
        .iter()
        .find(|(id, _)| id.as_slice() == &raw[n - 80..n - 64])
        .is_some_and(|(_, pk)| verify(pk, label, &raw[..n - 64], &raw[n - 64..]))
}
