use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::io::{IsTerminal, Read};

pub(super) fn read_token() -> Result<String> {
    if std::io::stdin().is_terminal() {
        return crate::output::prompts::secret("Server setup token", |value| {
            p::decode_token(p::TTokenKind::Setup, value)
                .err()
                .map(|_| "Not a setup token".into())
        });
    }
    piped(&mut std::io::stdin())
}

fn piped(source: &mut dyn Read) -> Result<String> {
    let mut token = String::new();
    source.read_to_string(&mut token).map_err(|cause| {
        EnvdenError::with_source(ErrorCode::InvalidInput, "Cannot read setup token", cause)
    })?;
    let token = envden_core::text::js_trim(&token);
    if token.is_empty() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Provide the token on stdin or use the prompt in a terminal",
        ));
    }
    p::decode_token(p::TTokenKind::Setup, token)?;
    Ok(token.into())
}

pub(super) fn provided(hosted: Option<String>, value: Option<&str>) -> Result<Option<String>> {
    if hosted.is_some() {
        return Ok(hosted);
    }
    if let Some(token) = value {
        p::decode_token(p::TTokenKind::Setup, token)?;
    }
    Ok(value.map(str::to_owned))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hosted_token_wins_and_explicit_tokens_are_validated_before_preflight() {
        assert_eq!(
            provided(Some("hosted".into()), Some("invalid"))
                .unwrap()
                .as_deref(),
            Some("hosted")
        );
        assert_eq!(
            provided(None, Some("invalid")).unwrap_err().code,
            ErrorCode::InvalidInput
        );
    }

    #[test]
    fn piped_token_is_trimmed_and_validated() {
        let token = p::encode_token(p::TTokenKind::Setup, &[1; 20], &[2; 32]);
        assert_eq!(
            piped(&mut format!("  {token}\n").as_bytes()).unwrap(),
            token
        );
        assert_eq!(
            piped(&mut format!("\u{feff}{token}\u{feff}").as_bytes()).unwrap(),
            token
        );
        assert!(piped(&mut format!("\u{0085}{token}\u{0085}").as_bytes()).is_err());
        for value in ["", " \n", "bad"] {
            assert_eq!(
                piped(&mut value.as_bytes()).unwrap_err().code,
                ErrorCode::InvalidInput
            );
        }
    }
}
