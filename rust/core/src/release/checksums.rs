use crate::errors::{EnvdenError, ErrorCode, Result};
use regex::Regex;
use std::{collections::BTreeMap, sync::LazyLock};
static ENTRY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^([a-f0-9]{64}) [ *]([^\t\n\x0b\x0c\r \u{a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}]+)$").unwrap()
});
pub fn parse_sha256_sums(contents: &str) -> Result<BTreeMap<String, String>> {
    let mut hashes = BTreeMap::new();
    for line in contents.trim_matches(js_whitespace).split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        let m = ENTRY
            .captures(line)
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Invalid SHA256SUMS entry"))?;
        if hashes
            .insert(m[2].to_owned(), m[1].to_ascii_lowercase())
            .is_some()
        {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Duplicate SHA256SUMS entry",
            ));
        }
    }
    Ok(hashes)
}

fn js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\x0b' | '\x0c' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}
