use super::TTokenKind;
use crate::protocol::encoding::{base32, unbase32};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub fn encode_token(kind: TTokenKind, secret: &[u8; 20], pin: &[u8; 32]) -> String {
    base32(
        &[
            &[match kind {
                TTokenKind::Setup => 1,
                TTokenKind::Repair => 2,
            }],
            secret.as_slice(),
            pin,
        ]
        .concat(),
    )
}

pub fn decode_token(kind: TTokenKind, text: &str) -> Result<([u8; 20], [u8; 32])> {
    let text: String = text
        .chars()
        .filter(|c| !matches!(*c, '\u{9}'..='\u{d}' | '\u{20}' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'))
        .collect();
    let b = unbase32(&text)
        .ok()
        .filter(|b| {
            b.len() == 53
                && b[0]
                    == match kind {
                        TTokenKind::Setup => 1,
                        TTokenKind::Repair => 2,
                    }
        })
        .ok_or_else(|| {
            EnvdenError::new(
                ErrorCode::InvalidInput,
                match kind {
                    TTokenKind::Setup => "That isn't a setup token. Copy the whole token.",
                    TTokenKind::Repair => "That isn't a repair token. Copy the whole token.",
                },
            )
        })?;
    Ok((
        b[1..21].try_into().expect("checked length"),
        b[21..].try_into().expect("checked length"),
    ))
}

pub fn is_token(kind: TTokenKind, text: &str) -> bool {
    decode_token(kind, text).is_ok()
}
