use crate::{
    adapters::IAdapters,
    output::{print, terminal_json},
    program::IInvocation,
    updates::{check::run_update_check, fetch::HttpFetcher, maintenance::refresh_installation},
};
use envden_core::errors::Result;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    if invocation
        .options
        .get("postInstall")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        refresh_installation(adapters);
        return Ok(());
    }
    if invocation
        .options
        .get("check")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        print(&terminal_json(&run_update_check(
            adapters,
            (adapters.now)(),
            true,
            &HttpFetcher,
        )?));
        return Ok(());
    }
    print(&terminal_json(
        &crate::updates::self_update::run::self_update(adapters, &HttpFetcher)?,
    ));
    Ok(())
}
