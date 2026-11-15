use super::{ICheckoutOptions, preferences::preferences, setup_checkouts, vault::create::create};
use crate::{
    adapters::IAdapters,
    output::prompts::input,
    state::{
        lock::with_state_lock,
        repository::{load_state, save_state},
    },
};
use envden_core::errors::Result;
use serde_json::Value;

pub fn run_setup(adapters: &IAdapters, options: &Value) -> Result<Value> {
    with_state_lock(&adapters.home, (adapters.now)(), || {
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
        save_state(&adapters.home, &state, (adapters.now)())?;
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
            (adapters.now)(),
        )?;
        Ok(state)
    })
}

pub(crate) fn device_name(options: &Value) -> Result<String> {
    use std::io::IsTerminal;
    if let Some(name) = options["name"].as_str() {
        return Ok(name.into());
    }
    let hostname = std::process::Command::new("hostname")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "device".into());
    let name = crate::identity::name::suggested_device_name(&hostname);
    if std::io::stdin().is_terminal() {
        input("Device name", true, Some(&name), |_| None)
    } else {
        Ok(name)
    }
}
