mod js_number;

pub use js_number::js_number;

pub fn js_trim(value: &str) -> &str {
    value.trim_matches(js_whitespace)
}

pub fn js_trim_start(value: &str) -> &str {
    value.trim_start_matches(js_whitespace)
}

pub fn js_trim_end(value: &str) -> &str {
    value.trim_end_matches(js_whitespace)
}

fn js_whitespace(ch: char) -> bool {
    matches!(ch, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ecmascript_whitespace_table() {
        for ch in [
            '\u{0009}', '\u{000a}', '\u{000b}', '\u{000c}', '\u{000d}', '\u{0020}', '\u{00a0}',
            '\u{1680}', '\u{2000}', '\u{2001}', '\u{2002}', '\u{2003}', '\u{2004}', '\u{2005}',
            '\u{2006}', '\u{2007}', '\u{2008}', '\u{2009}', '\u{200a}', '\u{2028}', '\u{2029}',
            '\u{202f}', '\u{205f}', '\u{3000}', '\u{feff}',
        ] {
            let input = format!("{ch}x{ch}");
            assert_eq!(js_trim(&input), "x", "U+{:04X}", ch as u32);
            assert_eq!(js_trim_start(&input), format!("x{ch}"));
            assert_eq!(js_trim_end(&input), format!("{ch}x"));
        }
        for ch in ['\u{0085}', '\u{180e}', '\u{200b}', '\u{001c}'] {
            let input = format!("{ch}x{ch}");
            assert_eq!(js_trim(&input), input);
            assert_eq!(js_trim_start(&input), input);
            assert_eq!(js_trim_end(&input), input);
        }
    }
}
