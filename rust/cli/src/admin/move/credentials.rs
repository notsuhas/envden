use crate::{adapters::IAdapters, client::binary, state::files::optional_read};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::path::Path;

pub struct IMoveCredentials {
    pub token: Option<([u8; 20], [u8; 32])>,
    pub pin: [u8; 32],
    pub token_slot: String,
}

pub fn move_credentials(
    adapters: &IAdapters,
    directory: &Path,
    token: Option<&str>,
) -> Result<IMoveCredentials> {
    let saved_pin = optional_read(&directory.join("move-pin"))?;
    let token_slot = format!("envden/{}/move-token", adapters.home.display());
    if let Some(token) = token.filter(|t| !t.is_empty()) {
        adapters.keychain.set(&token_slot, token.as_bytes())?;
    }
    let saved_token = adapters.keychain.get(&token_slot, false)?;
    let token = saved_token
        .as_deref()
        .map(|s| p::decode_token(p::TTokenKind::Setup, &String::from_utf8_lossy(s)))
        .transpose()?;
    let pin = token
        .as_ref()
        .map(|t| Ok(t.1))
        .or_else(|| {
            saved_pin
                .filter(|s| !s.is_empty())
                .map(|s| binary(&s).and_then(|b| p::fixed(&b)))
        })
        .transpose()?
        .ok_or_else(|| {
            EnvdenError::new(
                ErrorCode::InvalidInput,
                "A setup token is required for a new move",
            )
        })?;
    Ok(IMoveCredentials {
        token,
        pin,
        token_slot,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_saved_move_pin_requires_setup_token() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = crate::adapters::create_adapters(
            Some(dir.path().join("envden")),
            dir.path().into(),
            || 42,
        );
        let state = dir.path().join("state");
        std::fs::create_dir(&state).unwrap();
        std::fs::write(state.join("move-pin"), "").unwrap();
        let error = move_credentials(&adapters, &state, None).err().unwrap();
        assert_eq!(error.code, ErrorCode::InvalidInput);
        assert_eq!(error.message, "A setup token is required for a new move");
    }
}
