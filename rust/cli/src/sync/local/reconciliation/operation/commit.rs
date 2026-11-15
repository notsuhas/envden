use crate::sync::{
    local::{
        conflicts::IConflictTarget,
        files::{base_path, write_bytes},
    },
    remote::context::ISyncContext,
};
use envden_core::errors::Result;
use std::path::Path;

pub(super) fn finish_file(
    context: &mut ISyncContext<'_>,
    targets: &[IConflictTarget],
    store: &str,
    next: Option<&[u8]>,
    server: Option<&[u8]>,
    entry: Option<&str>,
    mut operation: Option<&mut super::record::IOperation>,
) -> Result<()> {
    let now = (context.options.now)();
    let synced = super::preserve::synced_content(context, store);
    if crate::sync::local::files::read_bytes(Path::new(store))?.as_deref() != next {
        super::preserve::keep_unsynced(
            context,
            Path::new(store),
            targets.first(),
            synced.as_deref(),
        )?;
        write_bytes(Path::new(store), next, now)?;
    } else if let Some(next) = next
        && crate::sync::local::files::read_bytes(&base_path(&context.adapters.home, store, None))?
            .as_deref()
            != Some(next)
    {
        crate::state::files::atomic_write(Path::new(store), next, now)?;
    }
    if let Some(operation) = operation.as_deref_mut() {
        mark_written(context, store, operation, 0)?;
    }
    if let Some(entry) = entry {
        crate::state::files::atomic_write(
            &super::deletion::suffix(&base_path(&context.adapters.home, store, None), ".entry"),
            entry.as_bytes(),
            now,
        )?;
    }
    write_bytes(&base_path(&context.adapters.home, store, None), next, now)?;
    let preserve = server.is_some()
        || super::deletion::read_deletion(&context.adapters.home, store, now)?.is_some();
    for (index, target) in targets.iter().enumerate() {
        let report = |message: &str| {
            if let Some(report) = &context.options.report {
                report(message);
            }
        };
        if !super::super::placement::place_file_target(
            &mut super::super::placement::IPlacementContext {
                adapters: context.adapters,
                state: &mut context.state,
                now,
                report: &report,
            },
            target,
            next,
            preserve,
            synced.as_deref(),
        )? {
            continue;
        }
        if let Some(operation) = operation.as_deref_mut() {
            mark_written(context, store, operation, index + 1)?;
        }
        if target.mode == "copy" {
            write_bytes(
                &base_path(&context.adapters.home, store, Some(&target.root)),
                next,
                now,
            )?;
        }
    }
    crate::state::journal::journal_placement(&context.adapters.home, &context.state, now)
}

fn mark_written(
    context: &ISyncContext<'_>,
    store: &str,
    operation: &mut super::record::IOperation,
    index: usize,
) -> Result<()> {
    operation.written[index] = true;
    crate::state::files::atomic_write(
        &super::deletion::suffix(&base_path(&context.adapters.home, store, None), ".pending"),
        serde_json::to_string(operation).unwrap().as_bytes(),
        (context.options.now)(),
    )
}
