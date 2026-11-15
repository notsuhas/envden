use regex::{Captures, Regex};

pub fn redact_secrets(text: &str) -> String {
    let text = Regex::new(r"(?i)EK1(?:-[0-9A-Z]{1,5})+")
        .unwrap()
        .replace_all(text, "EK1-[redacted]");
    let text = Regex::new(r"(?i)\b[0-9A-HJKMNP-TV-Z]{40,}\b")
        .unwrap()
        .replace_all(&text, |m: &Captures<'_>| {
            let token = m[0].to_ascii_uppercase();
            if envden_protocol::protocol::is_token(
                envden_protocol::protocol::TTokenKind::Setup,
                &token,
            ) {
                "[setup token]"
            } else if envden_protocol::protocol::is_token(
                envden_protocol::protocol::TTokenKind::Repair,
                &token,
            ) {
                "[repair token]"
            } else {
                "[redacted]"
            }
        });
    let text = Regex::new(r"(?m)^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=).*$")
        .unwrap()
        .replace_all(&text, "${1}[redacted]");
    Regex::new(r#"\b([A-Za-z_][A-Za-z0-9_.-]*)=("[^"]*"|'[^']*'|[^\s&"']+)"#)
        .unwrap()
        .replace_all(&text, "${1}=[redacted]")
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_secret_formats() {
        let setup =
            "043GE1R70W3GE1R70W3GE1R70W3GE1R70W4GJ289144GJ289144GJ289144GJ289144GJ289144GJ289144GJ";
        let repair =
            "081G60R30C1G60R30C1G60R30C1G60R30C2GA1850M2GA1850M2GA1850M2GA1850M2GA1850M2GA1850M2GA";
        for (input, expected) in [
            (
                format!("Setup token:\n  {setup}"),
                "Setup token:\n  [setup token]",
            ),
            (
                format!("repair {} done", repair.to_lowercase()),
                "repair [repair token] done",
            ),
            (
                "kit EK1-040G2-08104-0G208-1040G-20810-7PG2 saved".into(),
                "kit EK1-[redacted] saved",
            ),
            (
                "blob 7ZZQ4ZZQ4ZZQ4ZZQ4ZZQ4ZZQ4ZZQ4ZZQ4ZZQ4ZZQ end".into(),
                "blob [redacted] end",
            ),
            (
                "DATABASE_URL=postgres://u:p@h/db".into(),
                "DATABASE_URL=[redacted]",
            ),
            (
                "export API_KEY=\"a b c\"".into(),
                "export API_KEY=[redacted]",
            ),
            ("  secret = two words".into(), "  secret =[redacted]"),
            (
                "request failed token=abc&code=1 at /x".into(),
                "request failed token=[redacted]&code=[redacted] at /x",
            ),
        ] {
            assert_eq!(redact_secrets(&input), expected);
        }
    }
}
