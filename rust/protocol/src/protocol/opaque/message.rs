use crate::protocol::encoding::require_value;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub fn opaque_message(value: &str, length: usize) -> Result<&str> {
    require_value(
        !value.is_empty()
            && value
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'),
        "Invalid OPAQUE encoding",
    )?;
    let bytes = B64.decode(value).map_err(|e| {
        EnvdenError::with_source(
            ErrorCode::InvalidData,
            "Invalid OPAQUE length or encoding",
            e,
        )
    })?;
    require_value(
        bytes.len() == length && B64.encode(bytes) == value,
        "Invalid OPAQUE length or encoding",
    )?;
    Ok(value)
}

pub fn opaque_length(key: &str) -> usize {
    match key {
        "serverSetup" | "serverLoginState" => 128,
        "clientRegistrationState"
        | "registrationResponse"
        | "exportKey"
        | "finishLoginRequest"
        | "sessionKey" => 64,
        "registrationRequest" | "serverStaticPublicKey" => 32,
        "registrationRecord" | "clientLoginState" => 192,
        "startLoginRequest" => 96,
        "loginResponse" => 320,
        _ => 0,
    }
}
