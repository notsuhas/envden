use super::hash::frame;
use crate::protocol::keys::validate_ed_public;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};

pub fn sign(sk: &[u8; 32], label: &str, message: &[u8]) -> [u8; 64] {
    SigningKey::from_bytes(sk)
        .sign(&frame(label, message))
        .to_bytes()
}

pub fn verify(public: &[u8; 32], label: &str, message: &[u8], signature: &[u8]) -> bool {
    if validate_ed_public(public).is_err() {
        return false;
    }
    let Ok(key) = VerifyingKey::from_bytes(public) else {
        return false;
    };
    let Ok(signature) = Signature::from_slice(signature) else {
        return false;
    };
    key.verify_strict(&frame(label, message), &signature)
        .is_ok()
}
