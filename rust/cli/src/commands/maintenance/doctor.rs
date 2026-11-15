use crate::{
    adapters::IAdapters,
    diagnostics::{
        doctor,
        render::{doctor_json, doctor_text},
    },
    output::{print, terminal_json},
    program::IInvocation,
};
use envden_core::errors::Result;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let report = doctor(adapters)?;
    print(&if invocation
        .options
        .get("json")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        terminal_json(&doctor_json(&report))
    } else {
        doctor_text(&report)
    });
    Ok(())
}
