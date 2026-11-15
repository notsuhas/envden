use crate::{adapters::create_adapters, http::types::IServerKeys};
use envden_core::{
    adapters::storage::{IStateWrite, IStorageAdapter, TStateKind},
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::*;
use std::path::Path;

pub fn initialize_setup(
    storage: &dyn IStorageAdapter,
    public: &[u8; 32],
    replacement: Option<&str>,
) -> Result<Option<String>> {
    let pin = server_pin(public)?;
    if replacement.is_none()
        && (storage.setup_token()?.is_some()
            || storage
                .state(&[0; 32], TStateKind::SetupIssued, &[])?
                .is_some()
            || !storage.vault_ids()?.is_empty())
    {
        return Ok(None);
    }
    let secret = if let Some(replacement) = replacement {
        let (secret, supplied) = decode_token(TTokenKind::Setup, replacement)?;
        if supplied != pin {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Setup token pin mismatch",
            ));
        }
        secret
    } else {
        random_bytes()
    };
    storage.transaction(&mut || {
        storage.set_setup_token(&token_key(TTokenKind::Setup, &secret))?;
        storage.write_state(
            &[0; 32],
            &[IStateWrite {
                kind: TStateKind::SetupIssued,
                key: vec![],
                bytes: Some(vec![1]),
            }],
        )
    })?;

    Ok(Some(encode_token(TTokenKind::Setup, &secret, &pin)))
}

pub fn reissue_setup(storage: &dyn IStorageAdapter, public: &[u8; 32]) -> Result<Option<String>> {
    if !storage.vault_ids()?.is_empty() {
        return Ok(None);
    }
    let replacement = encode_token(TTokenKind::Setup, &random_bytes(), &server_pin(public)?);

    initialize_setup(storage, public, Some(&replacement))
}

pub fn local_setup_token(directory: &Path, now: u64) -> Result<Option<String>> {
    let IServerKeys { public_key, .. } = super::load_server_keys(directory)?;
    let storage = create_adapters(directory, now)?;
    let result = reissue_setup(storage.as_ref(), &public_key);
    let closed = storage.close();

    result.and_then(|token| closed.map(|()| token))
}
