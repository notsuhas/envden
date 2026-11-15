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
    if invocation.options.get("refreshCache") == Some(&true.into()) {
        return Ok(());
    }
    let report = status_report(adapters, Rc::new(UreqTransport))?;
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
