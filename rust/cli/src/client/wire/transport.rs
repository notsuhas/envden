use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;
use std::{collections::BTreeMap, io::Read, time::Duration};

pub struct IHttpRequest {
    pub url: url::Url,
    pub method: String,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
    pub timeout: Duration,
    pub allow_redirect_response: bool,
}

#[derive(Debug)]
pub struct IHttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
    pub location: Option<String>,
}

impl IHttpResponse {
    pub fn json(&self) -> Result<Value> {
        serde_json::from_slice(&self.body).map_err(|cause| {
            EnvdenError::with_source(ErrorCode::InvalidData, "Invalid server response", cause)
        })
    }

    pub fn ok(&self) -> bool {
        (200..300).contains(&self.status)
    }
}

pub trait ITransport {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse>;
}

pub struct UreqTransport;

impl ITransport for UreqTransport {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        let run = || -> std::result::Result<IHttpResponse, ureq::Error> {
            let agent: ureq::Agent = ureq::Agent::config_builder()
                .http_status_as_error(false)
                .max_redirects(0)
                .timeout_global(Some(request.timeout))
                .build()
                .into();
            let mut wire = ureq::http::Request::builder()
                .method(request.method.as_str())
                .uri(request.url.as_str());
            for (name, value) in &request.headers {
                wire = wire.header(name, value);
            }
            let wire = wire.body(request.body).map_err(ureq::Error::Http)?;
            let mut response = agent.run(wire)?;
            if response.status().is_redirection() && !request.allow_redirect_response
            {
                return Err(ureq::Error::TooManyRedirects);
            }
            let mut body = Vec::new();
            response
                .body_mut()
                .as_reader()
                .read_to_end(&mut body)
                .map_err(ureq::Error::Io)?;
            Ok(IHttpResponse {
                status: response.status().as_u16(),
                location: response
                    .headers()
                    .get("location")
                    .and_then(|h| h.to_str().ok())
                    .map(str::to_owned),
                body,
            })
        };
        run().map_err(|cause| {
            EnvdenError::with_source(
                ErrorCode::ServerUnreachable,
                "Server unreachable; check the server address and your private network",
                cause,
            )
        })
    }
}
