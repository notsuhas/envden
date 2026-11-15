use super::fit_device_name;
use unicode_general_category::{GeneralCategory, get_general_category};

pub fn suggested_device_name(hostname: &str) -> String {
    let host: String = hostname
        .chars()
        .filter(|c| {
            !matches!(
                get_general_category(*c),
                GeneralCategory::Control | GeneralCategory::Format
            )
        })
        .collect();
    let name = fit_device_name(
        envden_core::text::js_trim(host.split('.').next().unwrap_or_default()),
        0,
    );
    let name = envden_core::text::js_trim(&name);
    if name.is_empty() {
        "device".into()
    } else {
        name.into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn suggestions_match_reference() {
        for (input, expected) in [
            ("Suhas-MacBook-Pro.local".into(), "Suhas-MacBook-Pro".into()),
            ("  padded  ".into(), "padded".into()),
            ("lap\u{7}top\u{200b}".into(), "laptop".into()),
            (".local".into(), "device".into()),
            ("\u{200e}".into(), "device".into()),
            ("a".repeat(70), "a".repeat(64)),
            ("é".repeat(40), "é".repeat(32)),
            (format!("{}😀", "a".repeat(62)), "a".repeat(62)),
        ] {
            assert_eq!(suggested_device_name(&input), expected);
        }
    }
}
