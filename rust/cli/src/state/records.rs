use super::files::{atomic_write, optional_read};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{fs, path::Path};

pub fn read_sync_record<T>(path: &Path, decode: impl Fn(&str) -> Result<T>) -> Result<Option<T>> {
    let Some(saved) = optional_read(path)? else {
        return Ok(None);
    };
    decode(&saved).map(Some).map_err(|_| {
        EnvdenError::new(
            ErrorCode::InvalidData,
            format!(
                "Invalid sync state: {}; move this file aside and run envden pull",
                path.display()
            ),
        )
    })
}

pub fn recover_sync_record<T>(
    path: &Path,
    marker: &Path,
    decode: impl Fn(&str) -> Result<T>,
    now: u64,
    report: impl Fn(&str),
) -> Result<Option<T>> {
    match read_sync_record(path, decode) {
        Err(e) if e.code == ErrorCode::InvalidData => {
            let backup = format!(
                "{}.corrupt-{now:013}_{}",
                path.display(),
                uuid::Uuid::new_v4()
            );
            atomic_write(marker, backup.as_bytes(), now)?;
            fs::rename(path, &backup).map_err(super::files::failure)?;
            report(&format!(
                "Invalid sync state: {}; saved {backup}; run envden pull, then envden resolve --list",
                path.display()
            ));
            Ok(None)
        }
        result => result,
    }
}
