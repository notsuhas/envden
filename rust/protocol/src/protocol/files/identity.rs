use crate::protocol::{
    crypto::mac,
    encoding::{encode, require_value, valid_string},
};
use envden_core::errors::Result;

pub fn validate_path(path: &str) -> Result<()> {
    valid_string(path)?;
    require_value(
        !path.is_empty()
            && !path.contains(['\\', ':'])
            && path.split('/').all(|s| {
                let stem = s.split('.').next().unwrap_or("").to_ascii_lowercase();
                let reserved = matches!(stem.as_str(), "con" | "prn" | "aux" | "nul")
                    || ["com", "lpt"].iter().any(|prefix| {
                        stem.strip_prefix(prefix).is_some_and(|tail| {
                            tail.chars().count() == 1 && "123456789¹²³".contains(tail)
                        })
                    });
                !s.is_empty() && s != "." && s != ".." && !s.ends_with(['.', ' ']) && !reserved
            }),
        "Invalid relative path",
    )
}

pub fn file_id(key: &[u8; 32], repo: &str, path: &str) -> Result<[u8; 32]> {
    validate_path(path)?;
    Ok(mac(
        key,
        "file-id",
        &[encode(&repo.to_owned())?, encode(&path.to_owned())?].concat(),
    ))
}
