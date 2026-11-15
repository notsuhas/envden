use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::{ICodec, decode};

pub fn text(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn binary(value: &str) -> Result<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(value).map_err(|cause| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid binary encoding", cause)
    })
}

pub fn decode_untrusted<T: ICodec>(bytes: &[u8]) -> Result<T> {
    decode(bytes).map_err(|cause| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid data from server", cause)
    })
}
