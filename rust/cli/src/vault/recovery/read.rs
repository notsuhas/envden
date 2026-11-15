use super::{IRecoveryKitInput, parse_kit, secret_key_problem, vault_id_problem};
use crate::output::prompts::{input, secret};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::path::Path;

pub fn read_kit(path: Option<&Path>) -> Result<IRecoveryKitInput> {
    if let Some(path) = path {
        let text = std::fs::read_to_string(path).map_err(|cause| {
            EnvdenError::with_source(
                ErrorCode::InvalidInput,
                "Can't read the recovery kit file",
                cause,
            )
        })?;
        return parse_kit(&text);
    }
    let secret_key = secret("Recovery secret key", |v| {
        secret_key_problem(v).map(str::to_owned)
    })?;
    let vault_id = input("Vault ID", true, None, |v| {
        vault_id_problem(v).map(str::to_owned)
    })?;
    Ok(IRecoveryKitInput {
        secret_key: secret_key.trim().into(),
        vault_id: vault_id.trim().into(),
    })
}
