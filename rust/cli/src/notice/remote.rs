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
    let checked_at =
        if notice.checked_at.fract() == 0.0 && notice.checked_at.abs() <= 9_007_199_254_740_991.0 {
            serde_json::json!(notice.checked_at as i64)
        } else {
            serde_json::json!(notice.checked_at)
        };
    atomic_write(
        &home.join("state/remote-notice.json"),
        serde_json::json!({"checkedAt":checked_at,"repos":notice.repos})
            .to_string()
            .as_bytes(),
        now,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_notice_preserves_timestamp() {
        let dir = tempfile::tempdir().unwrap();
        for checked_at in [-1.5, 42.25, 1_800_000_000_000.0] {
            write_remote_notice(
                dir.path(),
                &IRemoteNotice {
                    checked_at,
                    repos: vec!["repo".into()],
                },
                1,
            )
            .unwrap();
            let saved = read_remote_notice(dir.path()).unwrap().unwrap();
            assert_eq!(saved.checked_at, checked_at);
            assert_eq!(saved.repos, ["repo"]);
        }
    }
}
