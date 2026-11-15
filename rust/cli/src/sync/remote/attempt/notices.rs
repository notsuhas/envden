use crate::{state::repository::load_state, sync::remote::context::ISyncContext};
use envden_core::errors::Result;
use std::path::Path;

pub(in crate::sync::remote) fn report_blocked(context: &ISyncContext<'_>) -> Result<()> {
    let Some(state) = load_state(&context.adapters.home)? else {
        return Ok(());
    };
    let held = crate::ui::view::held::held_files(context.adapters, &state)?;
    for link in state["links"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|link| link["localOnly"] != true)
    {
        let path = Path::new(link["root"].as_str().unwrap_or_default())
            .join(link["path"].as_str().unwrap_or_default());
        if let Some(kind) = held.get(path.to_string_lossy().as_ref())
            && let Some(report) = &context.options.report
        {
            let shown = context
                .options
                .cwd
                .as_ref()
                .and_then(|cwd| path.strip_prefix(cwd).ok())
                .filter(|nearby| !nearby.as_os_str().is_empty())
                .unwrap_or(&path);
            report(&format!(
                "Held back {}: {}",
                shown.display(),
                crate::status::held::held_reason(kind)
            ));
        }
    }
    Ok(())
}
