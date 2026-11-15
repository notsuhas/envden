use crate::{adapters::IAdapters, program::IInvocation, ui::start::run_dashboard};
use envden_core::errors::Result;
use std::io::{self, IsTerminal};

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    run_dashboard(
        adapters,
        io::stdin().is_terminal(),
        invocation.options.get("port").and_then(|v| v.as_f64()),
        invocation
            .options
            .get("open")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
    )
}
