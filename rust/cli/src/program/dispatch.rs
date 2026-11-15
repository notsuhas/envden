use super::IInvocation;
use crate::{
    adapters::IAdapters,
    output::{print, skips_notices},
    settings, state,
    version::VERSION,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

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
    fn notice(&self, _: &IInvocation<'_>, adapters: &IAdapters, now: u64) -> Result<()> {
        let cwd = std::env::current_dir().ok();
        let notice = crate::notice::command::command_notice(
            adapters,
            now,
            &crate::updates::fetch::HttpFetcher,
            false,
            cwd.as_ref().and_then(|p| p.to_str()),
            false,
        );
        crate::notice::command::report_command_notice(&notice);
        Ok(())
    }

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
            ["server", "repair"] => {
                return crate::commands::server::repair::run(invocation, adapters);
            }
            ["server", "move" | "switch"] => {
                return crate::commands::server::moving::run(invocation, adapters);
            }
            ["device", "add"] => return crate::commands::device::add::run(adapters),
            ["join"] => return crate::commands::onboarding::join::run(invocation, adapters),
            ["setup"] => return crate::commands::onboarding::setup::run(invocation, adapters),
            ["vault", ..] => return crate::commands::vault::run::run(invocation, adapters),
            ["device", "ls"] => return crate::commands::device::ls::run(invocation, adapters),
            ["device", "rename"] => {
                return crate::commands::device::rename::run(invocation, adapters);
            }
            ["device", "rm"] => return crate::commands::device::rm::run(invocation, adapters),
            ["ui"] => return crate::commands::ui::run::run(invocation, adapters),
            ["track"] => return crate::commands::onboarding::run_track(invocation, adapters),
            ["unlock"] => return crate::commands::onboarding::run_unlock(adapters),
            ["update"] => return crate::commands::maintenance::update::run(invocation, adapters),
            ["serve"] => return crate::commands::server::serve::run(invocation, adapters),
            ["shell", action] => return crate::commands::shell::run(action, invocation, adapters),
            ["agent", "install"] => return crate::commands::agent::install(adapters),
            ["doctor"] => return crate::commands::maintenance::doctor::run(invocation, adapters),
            ["push" | "pull"] => return crate::commands::sync::transfer::run(invocation, adapters),
            ["resolve"] => return crate::commands::sync::resolve::run(invocation, adapters),
            ["status"] => return crate::commands::sync::status::run(invocation, adapters),
            ["rm"] => return crate::commands::sync::rm::run(invocation, adapters),
            ["history"] => return crate::commands::sync::history::run(invocation, adapters),
            ["diff"] => return crate::commands::sync::diff::run(invocation, adapters),
            ["alias"] => return crate::commands::sync::alias::run(invocation, adapters),
            ["local-only"] => {
                return crate::commands::checkouts::local_only::run(invocation, adapters);
            }
            ["untrack"] => return crate::commands::checkouts::untrack::run(invocation, adapters),
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
    settings::actions::apply_setting(&invocation.arguments, adapters)
}

fn not_implemented() -> EnvdenError {
    EnvdenError::new(ErrorCode::NotImplemented, "Not implemented")
}
