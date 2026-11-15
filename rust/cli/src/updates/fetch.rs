use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{collections::BTreeMap, time::Duration};

pub struct IResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TRedirect {
    Manual,
    Error,
    Follow,
}

pub trait IFetcher {
    fn fetch(&self, url: &str, redirect: TRedirect, timeout: Duration) -> Result<IResponse>;
}

pub struct HttpFetcher;

impl IFetcher for HttpFetcher {
    fn fetch(&self, url: &str, redirect: TRedirect, timeout: Duration) -> Result<IResponse> {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .http_status_as_error(false)
            .max_redirects(if redirect == TRedirect::Follow { 10 } else { 0 })
            .timeout_global(Some(timeout))
            .build()
            .into();
        let mut response = agent.get(url).call().map_err(failed)?;
        let status = response.status().as_u16();
        if redirect == TRedirect::Error && (300..400).contains(&status) {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Release redirect refused",
            ));
        }
        let headers = response
            .headers()
            .iter()
            .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.as_str().into(), v.into())))
            .collect();
        let body = response
            .body_mut()
            .with_config()
            .limit(u64::MAX)
            .read_to_vec()
            .map_err(failed)?;
        Ok(IResponse {
            status,
            headers,
            body,
        })
    }
}

fn failed(error: ureq::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::InvalidData, "Release download failed", error)
}
