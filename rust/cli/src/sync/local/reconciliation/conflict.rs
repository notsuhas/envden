use crate::sync::{
    local::conflicts::{
        author::entry_author,
        record::{IConflictSeed, IConflictSides, record_conflict},
    },
    remote::{context::ISyncContext, repairs::consume_repair},
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;

pub(super) fn record_file_conflict(
    context: &ISyncContext<'_>,
    seed: IConflictSeed,
    sides: &IConflictSides<'_>,
    variants: &[Option<&[u8]>],
    entry: Option<&p::IFileEntry>,
    repair: bool,
) -> Result<()> {
    let author = entry.and_then(|entry| entry_author(context, entry));
    let message = record_conflict(
        &context.adapters.home,
        seed,
        sides,
        variants,
        author.as_deref(),
        (context.options.now)(),
    )?;
    if let Some(message) = message
        && let Some(report) = &context.options.report
    {
        report(&message);
    }
    if let Some(entry) = entry.filter(|_| repair) {
        consume_repair(
            &context.adapters.home,
            &p::base32(&entry.file_id),
            (context.options.now)(),
        )?;
    }
    Ok(())
}
