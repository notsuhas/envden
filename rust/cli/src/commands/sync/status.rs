use crate::{
    adapters::IAdapters,
    client::UreqTransport,
    output::{print, terminal_json},
    program::IInvocation,
    status::{render::status_text, report::status_report},
};
use envden_core::errors::Result;
use std::rc::Rc;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let cwd = std::env::current_dir().map_err(crate::state::files::failure)?;
    let refresh = invocation.options.get("refreshCache") == Some(&true.into());
    if refresh {
        crate::notice::command::command_notice(
            adapters,
            (adapters.now)(),
            &crate::updates::fetch::HttpFetcher,
            true,
            cwd.to_str(),
            false,
        );
        return Ok(());
    }
    let report = status_report(adapters, Rc::new(UreqTransport))?;
    crate::notice::command::command_notice(
        adapters,
        (adapters.now)(),
        &crate::updates::fetch::HttpFetcher,
        false,
        cwd.to_str(),
        true,
    );
    print(&if invocation.options.get("json") == Some(&true.into()) {
        terminal_json(&report)
    } else {
        status_text(
            &report,
            &std::env::current_dir().map_err(crate::state::files::failure)?,
            &adapters.user_home,
        )
    });
    Ok(())
}
