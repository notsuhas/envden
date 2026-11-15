use crate::protocol::{
    codecs::IEnvelope,
    crypto::{kdf, open_box, seal_box},
    encoding::*,
};
use argon2::{Algorithm, Argon2, Params, Version};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub fn password_key(password: &str, salt: &[u8; 16]) -> Result<[u8; 32]> {
    let mut key = [0; 32];
    Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(65536, 3, 4, Some(32)).expect("fixed parameters"),
    )
    .hash_password_into(norm_pw(password)?.as_bytes(), salt, &mut key)
    .map_err(|e| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Unable to derive password key", e)
    })?;
    Ok(key)
}

pub fn seal_envelope(
    value: &IEnvelope,
    password: &str,
    secret: &[u8; 16],
    salt: &[u8; 16],
    nonce: &[u8; 24],
) -> Result<Vec<u8>> {
    let key = kdf(
        &[password_key(password, salt)?.as_slice(), secret].concat(),
        &value.vault_id,
        "envelope-key",
        &[],
    );
    let b = seal_box(
        &key,
        &encode(value)?,
        &[ctx("envelope"), value.vault_id.to_vec()].concat(),
        nonce,
    )?;
    Ok([&b[..1], salt, &b[1..]].concat())
}

pub fn open_envelope(
    blob: &[u8],
    password: &str,
    secret: &[u8; 16],
    vault: &[u8; 32],
) -> Result<IEnvelope> {
    let mut r = Reader::new(blob);
    require_value(r.u8()? == 1, "Invalid protocol data")?;
    let salt = r.fixed()?;
    let key = kdf(
        &[password_key(password, &salt)?.as_slice(), secret].concat(),
        vault,
        "envelope-key",
        &[],
    );
    let b = [&[1], r.take(blob.len() - r.offset)?].concat();
    let value: IEnvelope = decode(&open_box(
        &key,
        &b,
        &[ctx("envelope"), vault.to_vec()].concat(),
    )?)?;
    require_value(value.vault_id == *vault, "Vault ID mismatch")?;
    Ok(value)
}
