use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Value, json};

pub(super) fn resumed_kit(
    swap: &p::ISwap,
    vault: &str,
    address: &str,
    secret: &str,
) -> Result<Value> {
    let secret_bytes = zeroize::Zeroizing::new(p::decode_secret_key(secret)?);
    let vault_bytes = p::fixed(&p::unbase32(vault)?)?;
    if swap.sk_pub != Some(p::sk_pub(&secret_bytes, &vault_bytes)) {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Recovery kit does not match pending vault",
        ));
    }
    Ok(
        json!({"secretKey":secret,"vaultId":vault,"server":address,"masterPassword":"________________"}),
    )
}

pub(super) fn resume_secret(options: &Value) -> Result<Option<String>> {
    use crate::output::prompts::{consent, secret};
    use crate::vault::recovery::{parse_kit, secret_key_problem};
    if let Some(path) = options["kitOut"].as_str() {
        return crate::state::files::optional_read(std::path::Path::new(path))?
            .map(|v| parse_kit(&v).map(|v| v.secret_key))
            .transpose();
    }
    if !consent(
        "Setup stopped after giving you a recovery kit. Do you still have it?",
        true,
    )? {
        return Ok(None);
    }
    let value = secret("Secret key from that kit (EK1-…)", |v| {
        secret_key_problem(v).map(str::to_owned)
    })?;

    Ok(Some(trim_secret(&value)))
}

fn trim_secret(value: &str) -> String {
    envden_core::text::js_trim(value).into()
}

pub(super) fn report(
    adapters: &crate::adapters::IAdapters,
    options: &Value,
    name: &str,
    kit: &Value,
) -> Result<()> {
    if let Some(path) = options["kitOut"].as_str() {
        crate::vault::recovery::write_kit(std::path::Path::new(path), kit)?;
        println!("{}", kit_saved(path));
        Ok(())
    } else {
        crate::vault::recovery::pdf::report_kit(kit, &adapters.user_home, name, (adapters.now)())
    }
}

fn kit_saved(path: &str) -> String {
    crate::output::sanitize_console(&format!("Recovery kit saved to {path}"))
}

pub(super) fn replace_lost(
    adapters: &crate::adapters::IAdapters,
    options: &Value,
    name: &str,
    password: &str,
) -> Result<Value> {
    let replaced = crate::vault::admin::credentials::replace(
        adapters,
        password,
        std::rc::Rc::new(crate::client::UreqTransport),
        None,
        &mut |kit| {
            let mut kit = kit.clone();
            kit["masterPassword"] = json!("________________");
            report(adapters, options, name, &kit)
        },
    )
    .map_err(|cause| {
        EnvdenError::with_source(
            ErrorCode::RecoveryKitRequired,
            "Vault created without a recovery kit; run envden vault kit replace",
            cause,
        )
    })?;
    if replaced {
        return Err(EnvdenError::new(
            ErrorCode::RecoveryKitRequired,
            "Vault created without a recovery kit; run envden vault kit replace",
        ));
    }
    crate::state::repository::load_state(&adapters.home)?
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Missing local state"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        adapters::create_adapters,
        identity::device_identity,
        vault::{create_genesis, create_vault_swap},
    };
    #[test]
    fn resumed_secret_uses_javascript_whitespace() {
        assert_eq!(trim_secret("\u{feff}EK1-secret\u{feff}"), "EK1-secret");
        assert_eq!(
            trim_secret("\u{0085}EK1-secret\u{0085}"),
            "\u{0085}EK1-secret\u{0085}"
        );
    }

    #[test]
    fn kit_saved_strips_terminal_controls() {
        assert_eq!(
            kit_saved("kit\u{001b}[31m\u{202e}.json"),
            "Recovery kit saved to kit[31m.json"
        );
    }

    #[test]
    fn resumed_kit_must_match_pending_vault() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let identity =
            device_identity(&*adapters.keychain, &adapters.home, "test", false, 42).unwrap();
        let material = create_genesis(&identity, [2; 32], 42).unwrap();
        let creation = create_vault_swap(
            &material,
            &identity,
            "password",
            &crate::client::text(&[0; 192]),
            42,
        )
        .unwrap();
        assert!(
            resumed_kit(
                &creation.swap,
                &creation.vault_id,
                "server",
                &creation.secret_key
            )
            .is_ok()
        );
        assert!(
            resumed_kit(
                &creation.swap,
                &creation.vault_id,
                "server",
                &p::encode_secret_key(&[9; 16])
            )
            .is_err()
        );
    }
}
