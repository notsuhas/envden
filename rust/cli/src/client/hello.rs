use super::{IHttpRequest, ITransport, binary, decode_untrusted, text};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::{collections::BTreeMap, time::Duration};

#[derive(Clone)]
pub struct IHello {
    pub pin: [u8; 32],
    pub hello: p::IServerHello,
}

pub fn hello(
    address: &str,
    pin: Option<&[u8; 32]>,
    transport: &dyn ITransport,
    min_server: &str,
) -> Result<IHello> {
    let mut url = url::Url::parse(address)
        .and_then(|u| u.join("/v1/hello"))
        .map_err(|cause| {
            EnvdenError::with_source(ErrorCode::InvalidInput, "Invalid server address", cause)
        })?;
    let challenge = p::random_bytes();
    url.query_pairs_mut()
        .append_pair("challenge", &text(&challenge));
    let host = url.host_str().unwrap_or_default().to_owned();
    let response = transport.fetch(IHttpRequest {
        url,
        method: "GET".into(),
        headers: BTreeMap::new(),
        body: vec![],
        allow_redirect_response: false,
        timeout: Duration::from_secs(2),
    })?;
    if !response.ok() {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Server didn't answer as envden. Check the address points at an envden server",
        ));
    }
    let body = response.json().map_err(|cause| {
        EnvdenError::with_source(
            ErrorCode::InvalidData,
            "Server sent an invalid hello. Check the address points at an envden server",
            cause,
        )
    })?;
    let body: p::IHelloResponse = serde_json::from_value(body).map_err(|cause| {
        EnvdenError::with_source(
            ErrorCode::InvalidData,
            "Server sent an invalid hello. Check the address points at an envden server",
            cause,
        )
    })?;
    let signed: p::ISigned<p::IServerHello> = decode_untrusted(&binary(&body.hello)?)?;
    let presented = p::server_pin(&signed.body.server_sign_pub)?;
    if !matches!(
        p::verify_hello(
            &signed,
            &challenge,
            &host,
            pin.unwrap_or(&presented),
            "0.0.0"
        ),
        p::TVerification::Valid(_)
    ) {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Server identity doesn't match the expected server. Check the server address",
        ));
    }
    if p::compare_semver(&signed.body.app_version, min_server)?.is_lt() {
        return Err(EnvdenError::new(
            ErrorCode::ServerTooOld,
            "Server is too old for this envden. Update the server",
        ));
    }
    if !signed.body.protocols.contains(&1) {
        return Err(EnvdenError::new(
            ErrorCode::UpdateRequired,
            "Server has no protocol this envden knows. Update envden",
        ));
    }
    Ok(IHello {
        pin: presented,
        hello: signed.body,
    })
}
