use crate::{
    adapters::IAdapters,
    client::UreqTransport,
    output::{print, terminal_json},
    program::IInvocation,
    sync::{
        command::sync_options,
        diff::{diff, diff_text},
    },
};
use envden_core::errors::Result;
use std::rc::Rc;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let files = diff(
        adapters,
        sync_options(invocation, adapters),
        Rc::new(UreqTransport),
    )?;
    if invocation.options.get("json") == Some(&true.into()) {
        print(&terminal_json(&serde_json::json!(files)));
    } else {
        print(&diff_text(&files));
    }
    Ok(())
}
