use crate::{adapters::IAdapters, output::print, program::IInvocation};
use envden_core::errors::Result;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let path = invocation
        .arguments
        .first()
        .map(String::as_str)
        .unwrap_or_default();
    for file in crate::links::checkout::untrack::untrack(adapters, path)? {
        print(&format!("Cancelled removal: {file}"));
    }
    Ok(())
}
