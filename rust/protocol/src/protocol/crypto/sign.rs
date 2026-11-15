use super::hash::frame;
use crate::protocol::keys::validate_ed_public;
use curve25519_dalek::edwards::CompressedEdwardsY;
use ed25519_dalek::{Signer, SigningKey};
use ed25519_zebra::{Signature, VerificationKey};

pub fn sign(sk: &[u8; 32], label: &str, message: &[u8]) -> [u8; 64] {
    SigningKey::from_bytes(sk)
        .sign(&frame(label, message))
        .to_bytes()
}

pub fn verify(public: &[u8; 32], label: &str, message: &[u8], signature: &[u8]) -> bool {
    if validate_ed_public(public).is_err() {
        return false;
    }
    let Ok(key) = VerificationKey::try_from(*public) else {
        return false;
    };
    let Ok(signature) = Signature::try_from(signature) else {
        return false;
    };
    let r = *signature.r_bytes();
    if !CompressedEdwardsY(r)
        .decompress()
        .is_some_and(|point| point.compress().to_bytes() == r)
    {
        return false;
    }

    key.verify(&signature, &frame(label, message)).is_ok()
}
