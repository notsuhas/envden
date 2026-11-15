use super::{
    fetch::{IFetcher, TRedirect},
    github::{latest_release, release_asset_url},
};
use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    release::parse_sha256_sums,
};
use sha2::{Digest, Sha256};
use std::time::Duration;

pub fn download_update(
    fetcher: &dyn IFetcher,
    running: &str,
    platform: &str,
    timeout: Duration,
) -> Result<Option<Vec<u8>>> {
    let latest = latest_release(fetcher)?;
    if !envden_protocol::protocol::compare_semver(&latest, running)?.is_gt() {
        return Ok(None);
    }
    let name = format!(
        "envden-{platform}{}",
        if platform.starts_with("windows-") {
            ".exe"
        } else {
            ""
        }
    );
    let sums = fetcher.fetch(
        &release_asset_url(&latest, "SHA256SUMS"),
        TRedirect::Follow,
        timeout,
    )?;
    if !(200..300).contains(&sums.status) {
        return Err(invalid("Release checksums download failed"));
    }
    let text = String::from_utf8_lossy(&sums.body);
    let hashes = parse_sha256_sums(&text)?;
    let hash = hashes
        .get(&name)
        .ok_or_else(|| invalid("No release build for this platform"))?;
    let response = fetcher.fetch(
        &release_asset_url(&latest, &name),
        TRedirect::Follow,
        timeout,
    )?;
    if !(200..300).contains(&response.status) {
        return Err(invalid("Build download failed"));
    }
    if format!("{:x}", Sha256::digest(&response.body)) != *hash {
        return Err(invalid("Build checksum mismatch"));
    }
    Ok(Some(response.body))
}

fn invalid(message: &'static str) -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, message)
}
