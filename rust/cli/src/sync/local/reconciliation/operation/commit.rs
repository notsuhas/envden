use crate::sync::{
    local::{
        applied::mark_applied_entry,
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
    }
    write_bytes(Path::new(store), next, now)?;
    write_bytes(&base_path(&context.adapters.home, store, None), next, now)?;
    if let Some(entry) = entry {
        mark_applied_entry(&context.adapters.home, entry, Some(store), now)?;
    }
    let preserve = server.is_some()
        || super::deletion::read_deletion(&context.adapters.home, store, now)?.is_some();
    for target in targets {
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
        if target.mode == "copy" {
            write_bytes(
                &base_path(&context.adapters.home, store, Some(&target.root)),
                next,
                now,
            )?;
        }
    }
    crate::state::repository::save_state(&context.adapters.home, &context.state, now)
}
