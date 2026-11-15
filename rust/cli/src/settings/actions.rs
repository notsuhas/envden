use super::{TSettingRequest, config_text, read_config, set_config, setting_request, setting_text};
use crate::{
    adapters::IAdapters,
    client::{ITransport, UreqTransport},
    output::prompts::secret,
    state::{repository::load_state, require_configured},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{
    io::{self, IsTerminal},
    rc::Rc,
};

pub fn apply_setting(arguments: &[String], adapters: &IAdapters) -> Result<String> {
    match setting_request(arguments)? {
        TSettingRequest::List => Ok(config_text(&read_config(&adapters.home)?)),
        TSettingRequest::Read("unlock-period") => {
            let period = get_unlock_period(adapters, Rc::new(UreqTransport))?;
            Ok(format!(
                "unlock-period: {}",
                period
                    .period
                    .map(|p| format!("{}d", p as f64 / 86_400_000.0))
                    .unwrap_or_else(|| "never".into())
            ))
        }
        TSettingRequest::UnlockPeriod(value) => {
            require_configured(load_state(&adapters.home)?)?;
            let password = secret("Master password", |_| None)?;
            set_unlock_period(adapters, value, &password, Rc::new(UreqTransport))?;
            Ok(format!("unlock-period: {value}"))
        }
        TSettingRequest::Read(key) => Ok(setting_text(key, &read_config(&adapters.home)?)),
        TSettingRequest::Set(key, value) => Ok(setting_text(
            key,
            &set_config(
                key,
                value,
                &adapters.home,
                (adapters.now)(),
                io::stdin().is_terminal(),
            )?,
        )),
        TSettingRequest::Placement(path, mode) => Ok(setting_text(
            "placement",
            &set_checkout_placement(adapters, path, mode)?,
        )),
    }
}

pub fn set_checkout_placement(
    adapters: &IAdapters,
    path: &str,
    mode: &str,
) -> Result<serde_json::Value> {
    if !matches!(mode, "link" | "copy") {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Expected placement <checkout> link|copy",
        ));
    }
    let checkout = adapters
        .repo
        .checkout_at(path)?
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Checkout not found"))?;
    crate::state::lock::with_state_lock(&adapters.home, (adapters.now)(), || {
        let config = read_config(&adapters.home)?;
        let mut placement = config["placement"].as_object().cloned().unwrap_or_default();
        placement.insert(checkout.root, mode.into());
        set_config(
            "placement",
            &serde_json::to_string(&placement).expect("placement JSON"),
            &adapters.home,
            (adapters.now)(),
            false,
        )
    })
}

pub fn get_unlock_period(
    adapters: &IAdapters,
    transport: Rc<dyn ITransport>,
) -> Result<envden_protocol::protocol::IUnlockPeriod> {
    let context = crate::admin::shared::context::admin_context(adapters, transport)?;
    serde_json::from_value(
        context
            .client
            .request("/v1/settings/unlock-period", "GET", None)?
            .json()?,
    )
    .map_err(|e| EnvdenError::with_source(ErrorCode::InvalidData, "Invalid server response", e))
}

pub fn set_unlock_period(
    adapters: &IAdapters,
    value: &str,
    password: &str,
    transport: Rc<dyn ITransport>,
) -> Result<()> {
    let period = super::unlock_period(value)?;
    let context = crate::admin::shared::context::admin_context(adapters, transport)?;
    crate::session::login(
        &context.client,
        &context.vault_id,
        crate::session::TPassword::Fixed(password),
        envden_protocol::protocol::TLoginPurpose::Unlock,
    )?;
    context.client.request(
        "/v1/settings/unlock-period",
        "PUT",
        Some(&serde_json::json!({"period":period})),
    )?;
    Ok(())
}
