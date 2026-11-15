use crate::state::files::{atomic_write, private_directory};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::path::{Path, PathBuf};

pub fn write_report(home: &Path, document: &str, now: u64) -> Result<PathBuf> {
    let directory = home.join("reports");
    private_directory(&directory)?;
    let date = chrono::DateTime::from_timestamp_millis(now as i64)
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidInput, "Invalid report time"))?;
    let path = directory.join(format!(
        "{}.md",
        date.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
            .replace([':', '.'], "-")
    ));
    atomic_write(&path, document.as_bytes(), now)?;
    Ok(path)
}
