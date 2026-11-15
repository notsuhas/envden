use super::deletion::suffix;
use crate::{
    client::binary,
    sync::{
        local::{
            conflicts::{IConflictTarget, backup},
            files::{base_path, read_bytes},
        },
        remote::{content::entry_content, context::ISyncContext},
    },
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use std::path::Path;

pub fn synced_content(context: &ISyncContext<'_>, store: &str) -> Option<Vec<u8>> {
    let bytes = read_bytes(&suffix(
        &base_path(&context.adapters.home, store, None),
        ".entry",
    ))
    .ok()??;
    let encoded = std::str::from_utf8(&bytes).ok()?;
    let entry: p::IFileEntry = p::decode(&binary(encoded).ok()?).ok()?;
    entry_content(context, &entry).ok().flatten()
}

pub fn keep_unsynced(
    context: &ISyncContext<'_>,
    path: &Path,
    target: Option<&IConflictTarget>,
    synced: Option<&[u8]>,
) -> Result<()> {
    let bytes = read_bytes(path)?;
    if bytes.is_none() || bytes.as_deref() == synced {
        return Ok(());
    }
    if let Some(saved) = backup(&context.adapters.home, path, (context.options.now)())?
        && let Some(report) = &context.options.report
    {
        let shown = target
            .map(|t| Path::new(&t.root).join(&t.path))
            .unwrap_or_else(|| path.to_owned());
        let shown = context
            .options
            .cwd
            .as_ref()
            .and_then(|cwd| shown.strip_prefix(cwd).ok())
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(&shown);
        report(&crate::output::sanitize_terminal(&format!(
            "Kept your previous {} at {}",
            shown.display(),
            saved.display()
        )));
    }
    Ok(())
}
