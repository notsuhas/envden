use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    process::restrict_access,
};
use serde_json::Value;
use std::{fs::OpenOptions, io::Write, path::Path};

pub fn write_kit(path: &Path, kit: &Value) -> Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|cause| {
        EnvdenError::with_source(
            ErrorCode::InvalidInput,
            "Cannot create recovery kit; choose a new --kit-out path in an existing directory",
            cause,
        )
    })?;
    restrict_access(path, false)?;
    let text = serde_json::to_string_pretty(kit).expect("JSON value");
    file.write_all(text.as_bytes()).map_err(|cause| {
        EnvdenError::with_source(ErrorCode::Internal, "Recovery kit write failed", cause)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::recovery::parse_kit;
    use envden_protocol::protocol as p;
    use serde_json::json;
    #[test]
    fn private_export_roundtrips_and_preserves_existing_files() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("kit.json");
        let kit = json!({"vaultId":p::base32(&[0;32]),"secretKey":p::encode_secret_key(&[0;16])});
        write_kit(&path, &kit).unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert_eq!(parse_kit(&text).unwrap().vault_id, kit["vaultId"]);
        assert!(!text.ends_with('\n'));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        assert_eq!(
            write_kit(&path, &json!({"vault":"second"}))
                .unwrap_err()
                .code,
            ErrorCode::InvalidInput
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), text);
        assert_eq!(
            write_kit(&root.path().join("missing/kit.json"), &kit)
                .unwrap_err()
                .code,
            ErrorCode::InvalidInput
        );
        write_kit(
            &root.path().join("new-kit.json"),
            &json!({"vault":"second"}),
        )
        .unwrap();
    }
}
