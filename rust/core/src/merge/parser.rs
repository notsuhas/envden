use super::types::*;
use regex::Regex;
use std::sync::LazyLock;
static ASSIGNMENT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[\t\x0b\x0c\r \u{a0}]*(#[\t\x0b\x0c\r \u{a0}]*)?(export[\t\x0b\x0c\r \u{a0}]+)?([A-Za-z_][A-Za-z0-9_]*)[\t\x0b\x0c\r \u{a0}]*=([^\r\n]*)$").unwrap()
});
pub(super) fn latin1(bytes: &[u8]) -> String {
    bytes.iter().map(|&b| char::from(b)).collect()
}
pub(super) fn whitespace(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n'
            | '\x0b'
            | '\x0c'
            | '\r'
            | ' '
            | '\u{a0}'
            | '\u{feff}'
            | '\u{2028}'
            | '\u{2029}'
    )
}
pub fn parse_env(bytes: &[u8]) -> TParseResult {
    let skip = if bytes.starts_with(&[239, 187, 191]) {
        3
    } else {
        0
    };
    let content = &bytes[skip..];
    let mut entries = Vec::new();
    let mut offset = 0;
    let mut start = 0;
    for line in content.split_inclusive(|&b| b == 10) {
        let body = line
            .strip_suffix(b"\n")
            .map(|b| b.strip_suffix(b"\r").unwrap_or(b))
            .unwrap_or(line);
        let text = latin1(body);
        offset += line.len();
        let Some(m) = ASSIGNMENT.captures(&text) else {
            let trimmed = text.trim_matches(whitespace);
            if !trimmed.is_empty() && !trimmed.starts_with('#') {
                return Err(TConflict {
                    reason: "unsupported-syntax",
                    key: None,
                });
            }
            continue;
        };
        let key = m[3].to_owned();
        let value = m[4].trim_start_matches(whitespace);
        let quote = value
            .chars()
            .next()
            .filter(|c| matches!(c, '"' | '\'' | '`'))
            .map(|c| c.to_string())
            .unwrap_or_default();
        validate_value(value, &quote, &key, &latin1(&content[offset..]))?;
        if entries.iter().any(|e: &IEnvEntry| e.key == key) {
            return Err(TConflict {
                reason: "duplicate-key",
                key: Some(key),
            });
        }
        entries.push(IEnvEntry {
            key,
            raw: content[start..offset].to_vec(),
            exported: m.get(2).is_some(),
            quote,
            active: m.get(1).is_none(),
        });
        start = offset;
    }
    Ok(IParsedEnv {
        head: bytes[..skip].to_vec(),
        entries,
        tail: content[start..].to_vec(),
    })
}
pub fn validate_value(
    value: &str,
    quote: &str,
    key: &str,
    remaining: &str,
) -> Result<(), TConflict> {
    let fail = |reason| {
        Err(TConflict {
            reason,
            key: Some(key.to_owned()),
        })
    };
    if !quote.is_empty() {
        let chars: Vec<char> = value.chars().collect();
        let q = quote.chars().next().unwrap();
        let mut end = 1;
        while end < chars.len() {
            if chars[end] == '\\' && q != '\'' {
                end += 2;
                continue;
            }
            if chars[end] == q {
                break;
            }
            end += 1;
        }
        if end >= chars.len() {
            return fail(if remaining.contains(quote) {
                "multiline-value"
            } else {
                "unterminated-quote"
            });
        }
        let tail: String = chars[end + 1..].iter().collect();
        let tail = tail.trim_start_matches(whitespace);
        if !tail.is_empty() && !tail.starts_with('#') {
            return fail("unsupported-syntax");
        }
    } else if value.ends_with('\\') {
        return fail("multiline-value");
    }
    Ok(())
}
