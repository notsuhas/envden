use crate::protocol::{
    codecs::IRequest,
    crypto::{h, mac, sign, verify},
    encoding::*,
    keys::sk_seed,
};
use envden_core::errors::Result;

#[derive(Clone, Copy)]
pub enum TTokenKind {
    Setup,
    Repair,
}

pub fn token_key(kind: TTokenKind, secret: &[u8; 20]) -> [u8; 32] {
    h(
        match kind {
            TTokenKind::Setup => "setup-token",
            TTokenKind::Repair => "repair-token",
        },
        secret,
    )
}

pub fn token_proof(kind: TTokenKind, key: &[u8; 32], request: &IRequest) -> Result<[u8; 32]> {
    Ok(mac(
        key,
        match kind {
            TTokenKind::Setup => "token-proof",
            TTokenKind::Repair => "repair-proof",
        },
        &encode(request)?,
    ))
}

pub fn verify_token_proof(
    kind: TTokenKind,
    key: &[u8; 32],
    request: &IRequest,
    proof: &[u8],
) -> Result<bool> {
    use subtle::ConstantTimeEq;
    Ok(bool::from(proof.ct_eq(&token_proof(kind, key, request)?)))
}

pub fn sign_sk_proof(secret: &[u8; 16], vault: &[u8; 32], request: &IRequest) -> Result<[u8; 64]> {
    Ok(sign(&sk_seed(secret, vault), "sk-proof", &encode(request)?))
}

pub fn verify_sk_proof(public: &[u8; 32], request: &IRequest, proof: &[u8]) -> Result<bool> {
    Ok(verify(public, "sk-proof", &encode(request)?, proof))
}
