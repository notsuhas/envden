use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_core::text::js_trim;
use envden_protocol::protocol as p;
use serde_json::Value;

#[derive(Debug, PartialEq, Eq)]
pub struct IRecoveryKitInput {
    pub vault_id: String,
    pub secret_key: String,
}

pub fn secret_key_problem(text: &str) -> Option<&'static str> {
    p::decode_secret_key(js_trim(text))
        .is_err()
        .then_some("Not a secret key. Copy the EK1-… line from your recovery kit")
}

pub fn vault_id_problem(text: &str) -> Option<&'static str> {
    (!p::unbase32(js_trim(text)).is_ok_and(|b| b.len() == 32))
        .then_some("Not a vault ID. Copy it from your recovery kit")
}

pub fn parse_kit(text: &str) -> Result<IRecoveryKitInput> {
    let value: Value = serde_json::from_str(text).map_err(|cause| {
        EnvdenError::with_source(ErrorCode::InvalidInput, "Not a recovery kit file", cause)
    })?;
    let parse = || -> Option<IRecoveryKitInput> {
        let vault_id = value.get("vaultId")?.as_str()?;
        let secret_key = value.get("secretKey")?.as_str()?;
        if secret_key_problem(secret_key).is_some() || vault_id_problem(vault_id).is_some() {
            return None;
        }
        Some(IRecoveryKitInput {
            vault_id: js_trim(vault_id).into(),
            secret_key: js_trim(secret_key).into(),
        })
    };
    parse().ok_or_else(|| {
        EnvdenError::with_source(
            ErrorCode::InvalidInput,
            "Not a recovery kit file",
            EnvdenError::new(ErrorCode::InvalidInput, "Invalid recovery kit fields"),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn kit_validation_matches_reference() {
        let vault_id = p::base32(&[3; 32]);
        let secret_key = p::encode_secret_key(&[5; 16]);
        for value in [
            "# kit".into(),
            "{}".into(),
            json!({"vaultId":"v","secretKey":secret_key}).to_string(),
            json!({"vaultId":vault_id,"secretKey":"EK1-AAAAA"}).to_string(),
        ] {
            assert_eq!(
                parse_kit(&value).unwrap_err().message,
                "Not a recovery kit file"
            );
        }
        assert_eq!(
            parse_kit(
                &json!({"vaultId":vault_id,"secretKey":secret_key,"server":"local"}).to_string()
            )
            .unwrap(),
            IRecoveryKitInput {
                vault_id: vault_id.clone(),
                secret_key: secret_key.clone()
            }
        );
        assert!(secret_key_problem(&format!(" {} ", secret_key.to_lowercase())).is_none());
        assert!(vault_id_problem(&vault_id).is_none());
        let bom = json!({"vaultId":format!("\u{feff}{vault_id}\u{feff}"),"secretKey":format!("\u{feff}{secret_key}\u{feff}")});
        let parsed = parse_kit(&bom.to_string()).unwrap();
        assert_eq!(parsed.vault_id, vault_id);
        assert_eq!(parsed.secret_key, secret_key);
        assert!(vault_id_problem(&format!("\u{85}{vault_id}\u{85}")).is_some());
        for typo in [
            format!("{}0", &secret_key[..secret_key.len() - 1]),
            vault_id.clone(),
        ] {
            assert!(secret_key_problem(&typo).is_some());
        }
        for typo in [&vault_id[1..], &secret_key] {
            assert!(vault_id_problem(typo).is_some());
        }
    }
}

#[cfg(test)]
mod source_tests {
    #[test]
    fn kit_parse_preserves_failure_source() {
        for text in ["not json", "{}", r#"{"vaultId":"bad","secretKey":"bad"}"#] {
            let error = super::parse_kit(text).unwrap_err();
            assert_eq!(error.code, envden_core::errors::ErrorCode::InvalidInput);
            assert_eq!(error.message, "Not a recovery kit file");
            assert!(error.source.is_some());
        }
    }
}
