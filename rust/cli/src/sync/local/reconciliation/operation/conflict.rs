use crate::sync::local::conflicts::{conflict_records, save_conflicts};
use envden_core::errors::Result;
use std::path::Path;

pub(in crate::sync::local::reconciliation) fn blocks_file(
    home: &Path,
    store: &str,
    writable: bool,
    now: u64,
) -> Result<bool> {
    let records = conflict_records(home)?;
    if !records.iter().any(|record| record.store == store) {
        return Ok(false);
    }
    if !writable {
        return Ok(true);
    }
    save_conflicts(
        home,
        &records
            .into_iter()
            .filter(|record| record.store != store)
            .collect::<Vec<_>>(),
        now,
    )?;
    Ok(false)
}
