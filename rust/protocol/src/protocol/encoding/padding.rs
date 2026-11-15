use super::binary::{ICodec, Reader, require_value};
use envden_core::errors::Result;

pub fn pad(data: &[u8]) -> Vec<u8> {
    let mut out = data.to_vec();
    out.resize(data.len().div_ceil(256) * 256, 0);
    out
}

pub fn decode_padded<T: ICodec>(data: &[u8]) -> Result<T> {
    require_value(data.len().is_multiple_of(256), "Invalid padded length")?;
    let mut r = Reader::new(data);
    let value = T::read(&mut r)?;
    let rest = r.take(data.len() - r.offset)?;
    require_value(
        rest.len() < 256 && rest.iter().all(|&b| b == 0),
        "Invalid padding",
    )?;
    Ok(value)
}
