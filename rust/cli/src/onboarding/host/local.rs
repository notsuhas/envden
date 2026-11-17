use crate::{
    adapters::IAdapters, agent::service::port::installed_service_port, output::prompts::consent,
    state::repository::save_state,
};
use envden_core::{
    adapters::THttpsCheck,
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::Value;
use std::io::IsTerminal;

pub(in crate::onboarding) fn host_locally(
    adapters: &IAdapters,
    options: &Value,
) -> Result<Option<(String, Option<String>)>> {
    if let THttpsCheck::Problem(problem) = adapters.network.check_https_certificate()? {
        return Err(EnvdenError::new(ErrorCode::InvalidInput, problem.message));
    }
    let host = options["hostServer"] == true
        || (!options["server"].is_string()
            && std::io::stdin().is_terminal()
            && consent(
                "Host the server on this machine? An always-on host is recommended.",
                false,
            )?);
    if !host {
        return Ok(None);
    }
    let token = if options["setupToken"].is_null() {
        (adapters.local_setup_token)(adapters)?
    } else {
        None
    };
    let port = (adapters.server_port)()?;
    (adapters.host_server)(adapters, port)?;
    println!("Server installed on this machine");
    Ok(Some((adapters.network.expose(f64::from(port))?, token)))
}

pub(in crate::onboarding) fn rehost(adapters: &IAdapters, state: &mut Value) -> Result<()> {
    let platform = if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(windows) {
        "win32"
    } else {
        "linux"
    };
    if let Some(port) = installed_service_port(platform, &adapters.user_home, &adapters.home) {
        (adapters.host_server)(adapters, port)?;
        return Ok(());
    }
    let port = (adapters.server_port)()?;
    (adapters.host_server)(adapters, port)?;
    let exposed = adapters.network.expose(f64::from(port))?;
    if let Some(saved) = state["server"]["address"].as_str()
        && url::Url::parse(saved)
            .ok()
            .and_then(|v| v.host_str().map(str::to_owned))
            == url::Url::parse(&exposed)
                .ok()
                .and_then(|v| v.host_str().map(str::to_owned))
    {
        state["server"]["address"] = exposed.into();
        save_state(&adapters.home, state, &adapters.now)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
