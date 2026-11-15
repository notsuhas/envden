use super::binary::require_value;
use envden_core::errors::Result;

const ALPHABET: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

pub fn base32(data: &[u8]) -> String {
    let (mut bits, mut value, mut out) = (0, 0u32, String::new());
    for &byte in data {
        value = (value << 8) | u32::from(byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(ALPHABET[((value >> bits) & 31) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(ALPHABET[((value << (5 - bits)) & 31) as usize] as char);
    }
    out
}

pub fn unbase32(text: &str) -> Result<Vec<u8>> {
    require_value(
        text.bytes().all(|c| c.is_ascii_alphanumeric()),
        "Invalid base32",
    )?;
    let (mut bits, mut value, mut out) = (0, 0u32, Vec::new());
    for c in text.bytes() {
        let n = ALPHABET.iter().position(|&b| b == c.to_ascii_uppercase());
        require_value(n.is_some(), "Invalid base32")?;
        value = (value << 5) | n.expect("checked") as u32;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((value >> bits) as u8);
        }
    }
    require_value(
        bits < 5 && (value & ((1 << bits) - 1)) == 0,
        "Noncanonical base32",
    )?;
    Ok(out)
}
