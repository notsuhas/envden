use crate::protocol::{
    crypto::h,
    encoding::{base32, require_value, unbase32},
};
use envden_core::errors::Result;

pub fn encode_secret_key(secret: &[u8; 16]) -> String {
    let text = base32(&[secret.as_slice(), &h("sk-check", secret)[..2]].concat());
    format!(
        "EK1-{}",
        text.as_bytes()
            .chunks(5)
            .map(|c| std::str::from_utf8(c).expect("ASCII"))
            .collect::<Vec<_>>()
            .join("-")
    )
}
pub fn decode_secret_key(text: &str) -> Result<[u8; 16]> {
    require_value(
        text.to_ascii_uppercase().starts_with("EK1-"),
        "Invalid secret key prefix",
    )?;
    let bytes = unbase32(&text[4..].replace('-', ""))?;
    require_value(bytes.len() == 18, "Invalid secret key length")?;
    let secret: [u8; 16] = bytes[..16].try_into().expect("checked");
    require_value(
        bytes[16..] == h("sk-check", &secret)[..2],
        "Secret key checksum",
    )?;
    Ok(secret)
}
