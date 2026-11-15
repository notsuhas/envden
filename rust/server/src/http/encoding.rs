use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub fn text(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn binary(value: &str, length: Option<usize>) -> Result<Vec<u8>> {
    let invalid = || EnvdenError::new(ErrorCode::InvalidInput, "Invalid encoding");
    if value.is_empty()
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err(invalid());
    }
    let bytes = URL_SAFE_NO_PAD.decode(value).map_err(|_| invalid())?;
    if text(&bytes) != value || length.is_some_and(|size| bytes.len() != size) {
        return Err(invalid());
    }

    Ok(bytes)
}

pub(crate) fn input<T>(run: impl FnOnce() -> Result<T>) -> Result<T> {
    run().map_err(|error| {
        EnvdenError::new(
            if error.code == ErrorCode::UpdateRequired {
                ErrorCode::ServerTooOld
            } else {
                ErrorCode::InvalidInput
            },
            "Invalid input",
        )
    })
}

pub(crate) fn json_input<T: serde::de::DeserializeOwned>(value: &serde_json::Value) -> Result<T> {
    serde_json::from_value(value.clone())
        .map_err(|cause| EnvdenError::with_source(ErrorCode::InvalidInput, "Invalid input", cause))
}
