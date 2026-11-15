use crate::{adapters::IAdapters, program::IInvocation};
use envden_core::errors::Result;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let source = invocation
        .arguments
        .first()
        .map(String::as_str)
        .unwrap_or_default();
    let target = invocation
        .arguments
        .get(1)
        .map(String::as_str)
        .unwrap_or_default();
    crate::sync::alias::alias_unlinked_repo(adapters, source, target)?;
    crate::output::print("Alias saved");
    Ok(())
}
