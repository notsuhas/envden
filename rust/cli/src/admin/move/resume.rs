use crate::{
    admin::shared::{context::IAdminContext, history::current_history},
    client::text,
    state::files::atomic_write,
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use std::path::Path;

pub fn resume_move_address(
    context: &IAdminContext<'_>,
    directory: &Path,
) -> Result<Option<String>> {
    let history = current_history(context)?;
    let moved = history
        .entries
        .iter()
        .rev()
        .find(|e| matches!(e.body.change, p::TEntryPayload::ServerMoved(_)));
    let header = history.headers.last().expect("verified history");
    if let Some(entry) = moved
        && let p::TEntryPayload::ServerMoved(change) = &entry.body.change
        && header.body.op == 10
    {
        atomic_write(
            &directory.join("move-pin"),
            text(&change.new_pin).as_bytes(),
            (context.adapters.now)(),
        )?;
        let swap = p::ISwap {
            expected_head: header.body.prev,
            header: header.clone(),
            entries: vec![entry.clone()],
            files: None,
            keyring: None,
            envelope: None,
            sk_pub: None,
            opaque_record: None,
            approver: None,
        };
        atomic_write(
            &directory.join("move-swap.bin"),
            &p::encode(&swap)?,
            (context.adapters.now)(),
        )?;
        return Ok(Some(change.new_address.clone()));
    }
    Ok(None)
}
