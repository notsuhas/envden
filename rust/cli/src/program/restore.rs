use envden_core::errors::{EnvdenError, ErrorCode, Result};

const MAX_SAFE_INTEGER: u64 = (1 << 53) - 1;

pub(super) fn parse_version(value: &serde_json::Value) -> Result<u64> {
    let invalid = || {
        EnvdenError::new(
            ErrorCode::InvalidInput,
            "Version must be a number such as 3 or v3",
        )
    };
    let text = value.as_str().ok_or_else(invalid)?;
    let text = envden_core::text::js_trim(text);
    let digits = text.strip_prefix('v').unwrap_or(text);
    if digits.is_empty()
        || digits.len() > 16
        || digits.starts_with('0')
        || !digits.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(invalid());
    }
    digits
        .parse::<u64>()
        .ok()
        .filter(|version| *version <= MAX_SAFE_INTEGER)
        .ok_or_else(invalid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_version_accepts_only_safe_integers() {
        for (text, expected) in [
            ("v3", 3),
            ("\u{feff}3 ", 3),
            ("9007199254740991", 9_007_199_254_740_991),
        ] {
            assert_eq!(parse_version(&text.into()).unwrap(), expected);
        }
        for text in [
            "0",
            "01",
            "+3",
            "-1",
            "3.0",
            "v0",
            "10000000000000000",
            "9007199254740992",
            "9999999999999999",
            "\u{85}3",
        ] {
            let error = parse_version(&text.into()).unwrap_err();
            assert_eq!(error.code, ErrorCode::InvalidInput);
            assert_eq!(error.message, "Version must be a number such as 3 or v3");
        }
    }
}
