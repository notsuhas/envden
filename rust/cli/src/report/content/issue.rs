pub const REPOSITORY: &str = "notsuhas/envden";
pub const NEW_ISSUE_URL: &str = "https://github.com/notsuhas/envden/issues/new";
const TRUNCATED: &str = "\n\n(Truncated. The full report is on the reporter's machine.)";

fn encode(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

pub fn issue_title(args: &[String], code: &str) -> String {
    let pattern = regex::Regex::new("^[a-z][a-z-]*$").unwrap();
    let command = args
        .iter()
        .find(|s| pattern.is_match(s))
        .map(String::as_str)
        .unwrap_or("");
    format!("envden {command} fails with {code}")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn issue_url(title: &str, report: &str) -> String {
    let prefix = format!("{NEW_ISSUE_URL}?title={}&body=", encode(title));
    let full = encode(report);
    if prefix.len() + full.len() <= 7000 {
        return prefix + &full;
    }
    let budget = 7000usize.saturating_sub(prefix.len() + encode(TRUNCATED).len());
    let mut body = String::new();
    for character in report.chars() {
        let encoded = encode(&character.to_string());
        if body.len() + encoded.len() > budget {
            break;
        }
        body.push_str(&encoded);
    }
    prefix + &body + &encode(TRUNCATED)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn command_title_and_encoded_body() {
        assert_eq!(
            issue_title(&["--json".into(), "status".into()], "INVALID_DATA"),
            "envden status fails with INVALID_DATA"
        );
        assert_eq!(issue_title(&[], "TypeError"), "envden fails with TypeError");
        assert!(issue_url("T", "# Report\n\nbody & more").ends_with("body%20%26%20more"));
        let long = issue_url("T", &format!("start {}😀", "é ".repeat(5000)));
        assert!((6900..=7000).contains(&long.len()));
        assert!(long.ends_with(&encode(TRUNCATED)));
    }
}
