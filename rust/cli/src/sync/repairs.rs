use super::remote::context::ISyncContext;
use envden_core::errors::Result;
use envden_protocol::protocol as p;

pub(super) fn report_repairs(context: &ISyncContext<'_>, repairs: &[p::IFileEntry]) -> Result<()> {
    for repair in repairs {
        let path = super::remote::content::entry_name(context, repair)?.path;
        let state = if repair.state == 4 {
            "lost"
        } else {
            "restored"
        };
        if let Some(report) = &context.options.report {
            report(&format!("Repair changed file {path}: {state}"));
        }
    }
    Ok(())
}
