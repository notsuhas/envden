use crate::protocol::encoding::{Reader, require_value};
use chacha20poly1305::{
    KeyInit, XChaCha20Poly1305, XNonce,
    aead::{Aead, Payload},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub fn seal_box(key: &[u8; 32], plaintext: &[u8], ad: &[u8], nonce: &[u8; 24]) -> Result<Vec<u8>> {
    let ct = XChaCha20Poly1305::new(key.into())
        .encrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: plaintext,
                aad: ad,
            },
        )
        .map_err(|cause| {
            EnvdenError::with_source(ErrorCode::InvalidData, "Unable to encrypt box", cause)
        })?;
    Ok([&[1], nonce.as_slice(), &ct].concat())
}

pub fn open_box(key: &[u8; 32], data: &[u8], ad: &[u8]) -> Result<Vec<u8>> {
    let mut r = Reader::new(data);
    require_value(r.u8()? == 1, "Unknown blob version")?;
    let nonce = r.take(24)?;
    XChaCha20Poly1305::new(key.into())
        .decrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: r.take(data.len() - r.offset)?,
                aad: ad,
            },
        )
        .map_err(|cause| {
            EnvdenError::with_source(ErrorCode::InvalidData, "Unable to decrypt box", cause)
        })
}
