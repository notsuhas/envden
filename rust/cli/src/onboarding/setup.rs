use super::{ICheckoutOptions, preferences::preferences, setup_checkouts, vault::create::create};
use crate::{
    adapters::IAdapters,
    output::prompts::input,
    state::{
        lock::with_state_lock,
        repository::{load_state, save_state},
    },
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

pub fn run_setup(adapters: &IAdapters, options: &Value) -> Result<Value> {
    with_state_lock(&adapters.home, &adapters.now, || {
        let existing = load_state(&adapters.home)?;
        let configured = existing
            .as_ref()
            .is_some_and(|s| s.get("vaultId").is_some() && s.get("creationPending").is_none());
        let mut state = if configured {
            existing.expect("configured")
        } else {
            create(adapters, options)?
        };
        if configured && options["hostServer"] == true {
            super::host::rehost(adapters, &mut state)?;
        }
        preferences(adapters, options, configured)?;
        save_state(&adapters.home, &state, &adapters.now)?;
        setup_checkouts(
            adapters,
            &mut state,
            &ICheckoutOptions {
                scan_root: options["scanRoot"]
                    .as_array()
                    .map(|v| v.iter().filter_map(Value::as_str).map(Into::into).collect()),
                exclude_root: options["excludeRoot"]
                    .as_array()
                    .map(|v| v.iter().filter_map(Value::as_str).map(Into::into).collect()),
                verbose: options["verbose"] == true,
                command: Some("setup"),
                ..Default::default()
            },
        )?;
        super::vault::initial::push_initial(adapters, &mut state)?;
        crate::notice::cache::refresh_notice(
            &adapters.home,
            &state,
            |root| adapters.repo.case_insensitive(root, true),
            &adapters.now,
        )?;
        Ok(state)
    })
}

pub(crate) fn device_name(adapters: &IAdapters, options: &Value) -> Result<String> {
    use crate::identity::name::device_name_problem;
    use std::io::IsTerminal;

    if let Some(name) = options["name"].as_str() {
        if let Some(problem) = device_name_problem(name) {
            return Err(EnvdenError::new(ErrorCode::InvalidInput, problem));
        }

        return Ok(name.into());
    }
    let name = crate::identity::name::suggested_device_name(&adapters.hostname);
    if std::io::stdin().is_terminal() {
        input("Device name", true, Some(&name), |value| {
            device_name_problem(value).map(str::to_owned)
        })
    } else {
        Ok(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suggested_name_uses_the_adapter_hostname() {
        let dir = tempfile::tempdir().unwrap();
        let mut adapters =
            crate::adapters::create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        adapters.hostname = "injected-laptop".into();
        assert_eq!(
            device_name(&adapters, &serde_json::json!({})).unwrap(),
            crate::identity::name::suggested_device_name(&adapters.hostname)
        );
    }

    #[test]
    fn a_given_name_with_a_control_or_invisible_character_fails_before_signing() {
        let dir = tempfile::tempdir().unwrap();
        let adapters =
            crate::adapters::create_adapters(Some(dir.path().into()), dir.path().into(), || 42);

        for name in ["a\nb", "a\tb", "\x1b[2Jb", "a\u{200b}b", ""] {
            let error = device_name(&adapters, &serde_json::json!({ "name": name })).unwrap_err();

            assert_eq!(error.code, envden_core::errors::ErrorCode::InvalidInput);
            assert_eq!(
                error.message,
                "Device names are 1-64 bytes with no invisible characters"
            );
        }

        assert_eq!(
            crate::identity::name::device_name_problem("a\nb"),
            Some("Device names are 1-64 bytes with no invisible characters")
        );
        assert_eq!(crate::identity::name::device_name_problem("ab"), None);
    }
}
