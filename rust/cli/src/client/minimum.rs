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
        && let Ok(version) = tag_version(tag)
    {
        return Ok(version);
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    struct Fallback(Cell<usize>);
    impl ITransport for Fallback {
        fn fetch(&self, request: IHttpRequest) -> Result<super::super::IHttpResponse> {
            self.0.set(self.0.get() + 1);
            let public = request.url.host_str() == Some("github.com");
            assert_eq!(request.allow_redirect_response, public);
            assert_eq!(request.timeout, Duration::from_secs(2));
            Ok(super::super::IHttpResponse {
                status: if public { 302 } else { 200 },
                location: public.then(|| "/notsuhas/envden/releases/tag/invalid".into()),
                body: br#"{"tag_name":"v9.0.0"}"#.to_vec(),
            })
        }
    }

    #[test]
    fn invalid_redirect_tag_uses_api_fallback() {
        let transport = Fallback(Cell::new(0));
        assert_eq!(latest_release(&transport).unwrap(), "9.0.0");
        assert_eq!(transport.0.get(), 2);
    }
}
