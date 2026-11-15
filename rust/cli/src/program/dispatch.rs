use super::IInvocation;
use crate::{
    adapters::IAdapters,
    output::{print, skips_notices},
    settings::{self, TSettingRequest},
    state,
    version::VERSION,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::io::{self, IsTerminal};

pub trait ICommandActions {
    fn run(&self, invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()>;
}

pub trait ICommandHooks {
    fn notice(&self, _: &IInvocation<'_>, _: &IAdapters, _: u64) -> Result<()> {
        Ok(())
    }
    fn report(&self, _: &IInvocation<'_>, _: &IAdapters, _: &Result<()>) {}
}

pub struct DefaultHooks;
impl ICommandHooks for DefaultHooks {
    fn report(&self, invocation: &IInvocation<'_>, adapters: &IAdapters, result: &Result<()>) {
        crate::output::telemetry::report_telemetry(
            adapters,
            &crate::output::telemetry::IEvent {
                command: &invocation.command.path.join(" "),
                success: result.is_ok(),
                error_code: result.as_ref().err().map(|e| e.code),
                changed: crate::output::counts::command_counts().changed,
                conflicts: crate::output::counts::command_counts().conflicts,
            },
        );
    }
}

pub struct DefaultActions;
impl ICommandActions for DefaultActions {
    fn run(&self, invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
        match invocation
            .command
            .path
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .as_slice()
        {
            ["unlock"] => return crate::commands::onboarding::run_unlock(adapters),
            ["version"] => print(VERSION),
            ["config"] => print(&config(invocation, adapters)?),
            _ => return Err(not_implemented()),
        }
        Ok(())
    }
}

pub fn dispatch(
    invocation: &IInvocation<'_>,
    adapters: &IAdapters,
    actions: &dyn ICommandActions,
    hooks: &dyn ICommandHooks,
) -> Result<()> {
    let now = (adapters.now)();
    let roots: Vec<String> = state::repository::load_state(&adapters.home)
        .ok()
        .flatten()
        .and_then(|s| s["approved"].as_array().cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(|v| v["root"].as_str().map(str::to_string))
        .collect();
    envden_core::process::set_untrusted_roots(&roots);
    let json = invocation
        .options
        .get("json")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    if !skips_notices(&invocation.command.name, json) {
        let _ = hooks.notice(invocation, adapters, now);
    }
    let result = actions.run(invocation, adapters);
    if invocation.command.name != "status"
        || invocation.options.get("refreshCache") != Some(&serde_json::Value::Bool(true))
    {
        hooks.report(invocation, adapters, &result);
    }
    result
}

fn config(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<String> {
    match settings::setting_request(&invocation.arguments)? {
        TSettingRequest::List => Ok(settings::config_text(&settings::read_config(
            &adapters.home,
        )?)),
        TSettingRequest::Read("unlock-period") | TSettingRequest::UnlockPeriod(_) => {
            state::require_configured(state::repository::load_state(&adapters.home)?)?;
            Err(not_implemented())
        }
        TSettingRequest::Read(key) => Ok(settings::setting_text(
            key,
            &settings::read_config(&adapters.home)?,
        )),
        TSettingRequest::Set(key, value) => Ok(settings::setting_text(
            key,
            &settings::set_config(
                key,
                value,
                &adapters.home,
                (adapters.now)(),
                io::stdin().is_terminal(),
            )?,
        )),
        TSettingRequest::Placement(_, _) => Err(not_implemented()),
    }
}

fn not_implemented() -> EnvdenError {
    EnvdenError::new(ErrorCode::NotImplemented, "Not implemented")
}
