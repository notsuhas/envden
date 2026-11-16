use super::{IRecoveryKitInput, parse_kit, secret_key_problem, vault_id_problem};
use crate::output::prompts::{input, secret};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::path::Path;

pub fn read_kit(path: Option<&Path>) -> Result<IRecoveryKitInput> {
    if let Some(path) = path {
        let bytes = std::fs::read(path).map_err(|cause| {
            EnvdenError::with_source(
                ErrorCode::InvalidInput,
                "Can't read the recovery kit file",
                cause,
            )
        })?;
        return parse_kit(&String::from_utf8_lossy(&bytes));
    }
    let secret_key = secret("Recovery secret key", |v| {
        secret_key_problem(v).map(str::to_owned)
    })?;
    let vault_id = input("Vault ID", true, None, |v| {
        vault_id_problem(v).map(str::to_owned)
    })?;
    Ok(IRecoveryKitInput {
        secret_key: envden_core::text::js_trim(&secret_key).into(),
        vault_id: envden_core::text::js_trim(&vault_id).into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_utf8_kit_is_parsed_with_replacement_characters() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("kit.json");
        std::fs::write(&path, b"\xff").unwrap();
        let error = read_kit(Some(&path)).unwrap_err();
        assert_eq!(error.message, "Not a recovery kit file");
        assert!(error.source.is_some());
    }
}
