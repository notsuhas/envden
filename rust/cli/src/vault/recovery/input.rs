use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::Value;

#[derive(Debug, PartialEq, Eq)]
pub struct IRecoveryKitInput {
    pub vault_id: String,
    pub secret_key: String,
}

pub fn secret_key_problem(text: &str) -> Option<&'static str> {
    p::decode_secret_key(text.trim())
        .is_err()
        .then_some("Not a secret key. Copy the EK1-… line from your recovery kit")
}

pub fn vault_id_problem(text: &str) -> Option<&'static str> {
    (!p::unbase32(text.trim()).is_ok_and(|b| b.len() == 32))
        .then_some("Not a vault ID. Copy it from your recovery kit")
}

pub fn parse_kit(text: &str) -> Result<IRecoveryKitInput> {
    let parse = || -> Option<IRecoveryKitInput> {
        let value: Value = serde_json::from_str(text).ok()?;
        let vault_id = value.get("vaultId")?.as_str()?;
        let secret_key = value.get("secretKey")?.as_str()?;
        if secret_key_problem(secret_key).is_some() || vault_id_problem(vault_id).is_some() {
            return None;
        }
        Some(IRecoveryKitInput {
            vault_id: vault_id.trim().into(),
            secret_key: secret_key.trim().into(),
        })
    };
    parse().ok_or_else(|| EnvdenError::new(ErrorCode::InvalidInput, "Not a recovery kit file"))
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
