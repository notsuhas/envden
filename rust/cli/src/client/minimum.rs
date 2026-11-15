use super::{IHttpRequest, ITransport};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::parse_semver;
use std::{collections::BTreeMap, time::Duration};

pub fn latest_release(transport: &dyn ITransport) -> Result<String> {
    let public = url::Url::parse("https://github.com/notsuhas/envden/releases/latest")
        .expect("constant URL");
    if let Ok(response) = transport.fetch(IHttpRequest {
        url: public.clone(),
        method: "GET".into(),
        headers: BTreeMap::new(),
        body: vec![],
        timeout: Duration::from_secs(2),
        allow_redirect_response: true,
    }) && (300..400).contains(&response.status)
        && let Some(location) = response.location
        && let Ok(url) = public.join(&location)
        && url.origin() == public.origin()
        && let Some(tag) = url.path().strip_prefix("/notsuhas/envden/releases/tag/")
    {
        return tag_version(tag);
    }
    let response = transport.fetch(IHttpRequest {
        url: url::Url::parse("https://api.github.com/repos/notsuhas/envden/releases/latest")
            .expect("constant URL"),
        method: "GET".into(),
        headers: BTreeMap::new(),
        body: vec![],
        timeout: Duration::from_secs(2),
        allow_redirect_response: false,
    })?;
    if !response.ok() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Latest release lookup failed",
        ));
    }
    let body = response.json()?;
    let tag = body
        .get("tag_name")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Invalid release response"))?;
    tag_version(tag)
}

fn tag_version(tag: &str) -> Result<String> {
    let version = tag
        .strip_prefix('v')
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Invalid release tag"))?;
    parse_semver(version).map_err(|cause| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid release tag", cause)
    })?;
    Ok(version.into())
}
