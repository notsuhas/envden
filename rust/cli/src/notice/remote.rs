use crate::state::files::{atomic_write, optional_read};
use envden_core::errors::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IRemoteNotice {
    pub checked_at: f64,
    pub repos: Vec<String>,
}

pub fn read_remote_notice(home: &Path) -> Result<Option<IRemoteNotice>> {
    Ok(optional_read(&home.join("state/remote-notice.json"))?
        .and_then(|s| serde_json::from_str::<IRemoteNotice>(&s).ok()))
}

pub fn write_remote_notice(home: &Path, notice: &IRemoteNotice, now: u64) -> Result<()> {
    atomic_write(
        &home.join("state/remote-notice.json"),
        serde_json::json!({"checkedAt":notice.checked_at as u64,"repos":notice.repos})
            .to_string()
            .as_bytes(),
        now,
    )
}
