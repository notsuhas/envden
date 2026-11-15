use crate::protocol::{
    crypto::kdf,
    encoding::{base32, require_value, unbase32},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub fn generate_pairing_code(mailbox: u32, random: &[u8; 5]) -> Result<String> {
    require_value((1..=999).contains(&mailbox), "Invalid protocol data")?;
    let t = base32(random);
    Ok(format!("{mailbox}-{}-{}", &t[..4], &t[4..]))
}

pub fn normalize_pairing_code(input: &str) -> Result<(u32, String)> {
    let parse = || -> Option<(u32, String)> {
        if !input
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b' ' || b == b'-')
        {
            return None;
        }
        let text = input
            .to_ascii_uppercase()
            .replace(['-', ' '], "")
            .replace('O', "0")
            .replace(['I', 'L'], "1");
        if text.len() < 9 {
            return None;
        }
        let n = text.len() - 8;
        let group = envden_core::text::js_trim(input).split(['-', ' ']).next()?;
        if group.len() < envden_core::text::js_trim(input).len() && group.len() != n {
            return None;
        }
        let mb = &text[..n];
        if mb.starts_with('0') || mb.len() > 3 || !mb.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        let pw = &text[n..];
        unbase32(pw).ok()?;
        Some((mb.parse().ok()?, pw.into()))
    };
    parse().ok_or_else(|| EnvdenError::new(ErrorCode::InvalidInput, "Codes look like 3-K7QF-2MXP"))
}

pub fn pairing_channel_keys(session: &[u8]) -> Result<([u8; 32], [u8; 32])> {
    require_value(session.len() == 64, "Invalid OPAQUE session key")?;
    Ok((
        kdf(session, &[], "pair/joiner-to-approver", &[]),
        kdf(session, &[], "pair/approver-to-joiner", &[]),
    ))
}
