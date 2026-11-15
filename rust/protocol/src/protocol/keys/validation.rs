use crate::protocol::encoding::require_value;
use curve25519_dalek::edwards::CompressedEdwardsY;
use envden_core::errors::Result;

pub fn validate_ed_public(key: &[u8; 32]) -> Result<()> {
    let point = CompressedEdwardsY(*key).decompress();
    require_value(
        point.is_some_and(|p| p.compress().to_bytes() == *key),
        "Invalid public key",
    )?;
    require_value(
        !point.expect("checked").is_small_order(),
        "Small order public key",
    )
}

pub fn validate_enc_public(key: &[u8; 32]) -> Result<()> {
    let mut p = [255; 32];
    p[0] = 237;
    p[31] = 127;
    require_value(
        key.iter().rev().cmp(p.iter().rev()).is_lt(),
        "Noncanonical encryption public key",
    )?;
    let shared = x25519_dalek::x25519([0; 32], *key);
    require_value(shared != [0; 32], "Invalid encryption public key")
}
