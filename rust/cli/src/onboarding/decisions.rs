use envden_core::errors::{EnvdenError, ErrorCode, Result};

const ADDRESS_HINT: &str = "Not a server address. Use one like envden.your-tailnet.ts.net";
const SHELLS: [&str; 4] = ["zsh", "bash", "fish", "powershell"];

#[derive(Debug, PartialEq, Eq)]
pub enum TConsentDecision {
    Selected(bool),
    Ask,
}

#[derive(Debug, PartialEq, Eq)]
pub enum TAgentDecision {
    Install,
    Ask,
    Skip,
}

pub fn derive_consent(value: Option<&str>, yes: bool, fallback: bool) -> TConsentDecision {
    if let Some(value) = value.filter(|v| !v.is_empty()) {
        return TConsentDecision::Selected(value == "on");
    }
    if yes {
        TConsentDecision::Selected(fallback)
    } else {
        TConsentDecision::Ask
    }
}

pub fn derive_shell(shell: &str) -> Option<&str> {
    SHELLS.into_iter().find(|s| *s == shell)
}

pub fn derive_agent(agent: Option<&str>, yes: bool) -> TAgentDecision {
    if agent == Some("on") {
        return TAgentDecision::Install;
    }
    if agent.is_none_or(str::is_empty) && !yes {
        TAgentDecision::Ask
    } else {
        TAgentDecision::Skip
    }
}

pub fn address_problem(text: &str) -> Option<&'static str> {
    server_address(text).is_none().then_some(ADDRESS_HINT)
}

pub fn require_server_address(text: &str) -> Result<String> {
    server_address(text).ok_or_else(|| EnvdenError::new(ErrorCode::InvalidInput, ADDRESS_HINT))
}

fn server_address(text: &str) -> Option<String> {
    let trimmed = envden_core::text::js_trim(text);
    let has_scheme = trimmed.split_once("://").is_some_and(|(scheme, _)| {
        scheme.starts_with(|c: char| c.is_ascii_alphabetic())
            && scheme
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c))
    });
    let candidate = if has_scheme {
        trimmed.to_owned()
    } else {
        format!("https://{trimmed}")
    };
    let url = url::Url::parse(&candidate).ok()?;
    (matches!(url.scheme(), "https" | "http") && url.host_str().is_some())
        .then(|| url.origin().ascii_serialization())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preference_decisions() {
        use TConsentDecision::*;
        for (value, yes, fallback, expected) in [
            (Some("on"), false, false, Selected(true)),
            (Some("off"), true, true, Selected(false)),
            (None, true, true, Selected(true)),
            (None, true, false, Selected(false)),
            (None, false, true, Ask),
        ] {
            assert_eq!(derive_consent(value, yes, fallback), expected);
        }
        assert_eq!(derive_shell("zsh"), Some("zsh"));
        assert_eq!(derive_shell("none"), None);
        for (agent, yes, expected) in [
            (Some("on"), true, TAgentDecision::Install),
            (Some("off"), false, TAgentDecision::Skip),
            (None, true, TAgentDecision::Skip),
            (None, false, TAgentDecision::Ask),
        ] {
            assert_eq!(derive_agent(agent, yes), expected);
        }
    }
    #[test]
    fn bare_hosts_and_invalid_addresses() {
        for (input, expected) in [
            ("envden.x.ts.net", "https://envden.x.ts.net"),
            ("\u{feff}envden.x.ts.net\u{feff}", "https://envden.x.ts.net"),
            (
                "\u{feff}https://envden.x.ts.net\u{feff}",
                "https://envden.x.ts.net",
            ),
            (" envden.x.ts.net/ ", "https://envden.x.ts.net"),
            ("https://envden.x.ts.net/v1", "https://envden.x.ts.net"),
            ("http://127.0.0.1:4783", "http://127.0.0.1:4783"),
        ] {
            assert_eq!(require_server_address(input).unwrap(), expected);
        }
        for input in [
            "",
            "https://",
            "ftp://envden.x.ts.net",
            "envden x",
            "\u{0085}envden.x.ts.net\u{0085}",
        ] {
            assert_eq!(address_problem(input), Some(ADDRESS_HINT));
            assert_eq!(
                require_server_address(input).unwrap_err().code,
                ErrorCode::InvalidInput
            );
        }
    }
}
