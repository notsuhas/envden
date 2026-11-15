use crate::http::encoding::text;
use envden_core::{
    adapters::storage::IStorageAdapter,
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::{Value, json};

pub(crate) fn read_range(
    storage: &dyn IStorageAdapter,
    vault: &[u8],
    headers: bool,
    from: Option<&str>,
    to: Option<&str>,
) -> Result<Value> {
    let from = from.map_or(Ok(0), super::parse_range_integer)?;
    let to = to.map_or(Ok(u64::MAX), super::parse_range_integer)?;
    if to < from {
        return Err(EnvdenError::new(ErrorCode::InvalidInput, "Invalid range"));
    }
    let rows = if headers {
        storage.headers(vault, from, to, Some(100), Some(786375))?
    } else {
        storage.entries(vault, from, to, Some(100), Some(786375))?
    };
    let mut objects = vec![];
    let mut size = 0;
    for row in rows {
        let encoded = text(&row.bytes);
        size += encoded.len() + 3;
        if size > 1048500 {
            if objects.is_empty() {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidData,
                    "History object too large",
                ));
            }
            break;
        }
        objects.push(encoded);
    }

    Ok(json!({"objects":objects}))
}

#[cfg(test)]
#[path = "tests/history.rs"]
mod tests;
