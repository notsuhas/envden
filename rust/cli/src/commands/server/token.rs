use crate::output::prompts::secret;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::io::{self, IsTerminal, Read};

pub fn read_token(kind: p::TTokenKind, value: Option<&str>) -> Result<String> {
    if io::stdin().is_terminal() && value.is_none() {
        let label = match kind {
            p::TTokenKind::Setup => "Server setup token",
            p::TTokenKind::Repair => "Repair token",
        };
        return secret(label, move |s| {
            (!p::is_token(kind, s)).then(|| {
                format!(
                    "Not a {} token",
                    if matches!(kind, p::TTokenKind::Setup) {
                        "setup"
                    } else {
                        "repair"
                    }
                )
            })
        });
    }
    let token = match value {
        Some(value) => value.to_string(),
        None => {
            let mut bytes = Vec::new();
            io::stdin()
                .read_to_end(&mut bytes)
                .map_err(crate::state::files::failure)?;
            let token = envden_core::text::js_trim(&String::from_utf8_lossy(&bytes)).to_string();
            if token.is_empty() {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidInput,
                    "Provide the token on stdin or use the prompt in a terminal",
                ));
            }
            token
        }
    };
    p::decode_token(kind, &token)?;
    Ok(token)
}
