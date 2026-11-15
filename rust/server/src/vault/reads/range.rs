use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub(crate) fn parse_range_integer(value: &str) -> Result<u64> {
    let invalid = || EnvdenError::new(ErrorCode::InvalidInput, "Invalid range");
    let value=value.trim_matches(|c:char|matches!(c,'\u{0009}'..='\u{000d}'|'\u{0020}'|'\u{00a0}'|'\u{1680}'|'\u{2000}'..='\u{200a}'|'\u{2028}'|'\u{2029}'|'\u{202f}'|'\u{205f}'|'\u{3000}'|'\u{feff}'));
    if value.is_empty() {
        return Ok(0);
    }
    for (prefix, radix) in [
        ("0x", 16),
        ("0X", 16),
        ("0o", 8),
        ("0O", 8),
        ("0b", 2),
        ("0B", 2),
    ] {
        if let Some(digits) = value.strip_prefix(prefix) {
            if digits.is_empty() || !digits.chars().all(|c| c.is_digit(radix)) {
                return Err(invalid());
            }
            return u64::from_str_radix(digits, radix).map_err(|_| invalid());
        }
    }
    let (negative, digits) = if let Some(digits) = value.strip_prefix('-') {
        (true, digits)
    } else {
        (false, value.strip_prefix('+').unwrap_or(value))
    };
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(invalid());
    }
    let result = digits.parse::<u64>().map_err(|_| invalid())?;
    if negative && result != 0 {
        return Err(invalid());
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn javascript_bigint_forms_with_unsigned_range() {
        for (value, expected) in [
            ("", 0),
            (" \t", 0),
            ("+001", 1),
            ("-0", 0),
            ("0x10", 16),
            ("0O10", 8),
            ("0b10", 2),
            ("18446744073709551615", u64::MAX),
        ] {
            assert_eq!(parse_range_integer(value).unwrap(), expected);
        }
        for value in [
            "-1",
            "+0x1",
            "-0b1",
            "0x",
            "1e1",
            "1.0",
            "18446744073709551616",
            "\u{85}",
        ] {
            assert!(parse_range_integer(value).is_err(), "{value}");
        }
    }
}
