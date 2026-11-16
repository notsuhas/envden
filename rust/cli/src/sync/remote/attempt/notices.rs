use crate::sync::{local::lineage::held_back_files, remote::context::ISyncContext};
use envden_core::errors::Result;
use std::path::Path;

pub(in crate::sync::remote) fn report_blocked(context: &ISyncContext<'_>) -> Result<()> {
    for notice in held_back_files(context.adapters)? {
        let path = Path::new(&notice.path);
        let shown = context
            .options
            .cwd
            .as_ref()
            .and_then(|cwd| path.strip_prefix(cwd).ok())
            .filter(|nearby| !nearby.as_os_str().is_empty())
            .unwrap_or(path);
        if let Some(report) = &context.options.report {
            report(&format!(
                "Held back {}: {}",
                shown.display(),
                crate::status::held::held_reason(notice.kind)
            ));
        }
    }
    Ok(())
}
