use super::fetch::{IFetcher, TRedirect};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::compare_semver;
use std::time::Duration;

pub const RELEASE_REPOSITORY: &str = "notsuhas/envden";

pub fn release_asset_url(version: &str, name: &str) -> String {
    format!("https://github.com/{RELEASE_REPOSITORY}/releases/download/v{version}/{name}")
}

fn tag_version(tag: &str) -> Result<String> {
    let version = tag.strip_prefix('v').ok_or_else(invalid_tag)?;
    compare_semver(version, "0.0.0").map_err(|cause| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid release tag", cause)
    })?;
    Ok(version.into())
}

fn invalid_tag() -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, "Invalid release tag")
}

pub fn latest_release(fetcher: &dyn IFetcher) -> Result<String> {
    if let Ok(response) = fetcher.fetch(
        &format!("https://github.com/{RELEASE_REPOSITORY}/releases/latest"),
        TRedirect::Manual,
        Duration::from_secs(2),
    ) && (300..400).contains(&response.status)
        && let Some(location) = response.headers.get("location")
    {
        let base = url::Url::parse("https://github.com").expect("release origin");
        let prefix = format!("/{RELEASE_REPOSITORY}/releases/tag/");
        if let Ok(url) = base.join(location)
            && url.origin() == base.origin()
            && let Some(tag) = url.path().strip_prefix(&prefix)
            && let Ok(version) = tag_version(tag)
        {
            return Ok(version);
        }
    }

    let response = fetcher.fetch(
        &format!("https://api.github.com/repos/{RELEASE_REPOSITORY}/releases/latest"),
        TRedirect::Error,
        Duration::from_secs(2),
    )?;
    if !(200..300).contains(&response.status) {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Latest release lookup failed",
        ));
    }
    let value: serde_json::Value = serde_json::from_slice(&response.body).map_err(|e| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid release response", e)
    })?;
    tag_version(
        value["tag_name"]
            .as_str()
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Invalid release response"))?,
    )
}
