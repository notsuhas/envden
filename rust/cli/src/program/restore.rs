use envden_core::errors::{EnvdenError, ErrorCode, Result};

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
    Ok(digits.parse::<f64>().map_err(|_| invalid())? as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_version_uses_reference_grammar_and_js_number_rounding() {
        for (text, expected) in [
            ("v3", 3),
            ("\u{feff}3 ", 3),
            ("9999999999999999", 10_000_000_000_000_000),
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
            "\u{85}3",
        ] {
            let error = parse_version(&text.into()).unwrap_err();
            assert_eq!(error.code, ErrorCode::InvalidInput);
            assert_eq!(error.message, "Version must be a number such as 3 or v3");
        }
    }
}
