use super::validation::validate_ed_public;
use crate::protocol::{
    crypto::{h, kdf},
    encoding::require_value,
};
use envden_core::errors::Result;

pub fn device_id(enc: &[u8; 32], obj: &[u8; 32], req: &[u8; 32]) -> [u8; 16] {
    h("device-id", &[enc.as_slice(), obj, req].concat())[..16]
        .try_into()
        .expect("fixed length")
}
pub fn recovery_id(enc: &[u8; 32], obj: &[u8; 32]) -> [u8; 16] {
    h("recovery-id", &[enc.as_slice(), obj].concat())[..16]
        .try_into()
        .expect("fixed length")
}
pub fn server_pin(public: &[u8; 32]) -> Result<[u8; 32]> {
    validate_ed_public(public)?;
    Ok(h("server-pin", public))
}
pub fn sk_seed(secret: &[u8; 16], vault_id: &[u8; 32]) -> [u8; 32] {
    kdf(secret, vault_id, "sk-sign", &[])
}
pub fn sk_pub(secret: &[u8; 16], vault_id: &[u8; 32]) -> [u8; 32] {
    ed25519_dalek::SigningKey::from_bytes(&sk_seed(secret, vault_id))
        .verifying_key()
        .to_bytes()
}
pub fn fixed<const N: usize>(value: &[u8]) -> Result<[u8; N]> {
    require_value(value.len() == N, "Wrong byte length")?;
    Ok(value.try_into().expect("checked"))
}
