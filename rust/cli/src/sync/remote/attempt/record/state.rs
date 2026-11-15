use super::codec::decode;
use crate::state::records::read_sync_record;
use envden_core::errors::{ErrorCode, Result};
use std::{fs, path::Path};

pub fn invalid_attempt_state(home: &Path) -> Result<bool> {
    let directory = home.join("state/attempts");
    let names = fs::read_dir(&directory)
        .and_then(|names| {
            names
                .map(|name| name.map(|name| name.file_name()))
                .collect::<std::io::Result<Vec<_>>>()
        })
        .unwrap_or_default();
    let receipt_name = |name: &str| {
        name.len() == 43
            && name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    };

    for name in names {
        let name = name.to_string_lossy();
        if name.strip_suffix(".invalid").is_some_and(receipt_name) {
            return Ok(true);
        }
        if !receipt_name(&name) {
            continue;
        }
        match read_sync_record(&directory.join(name.as_ref()), |saved| decode(saved, &name)) {
            Err(error) if error.code == ErrorCode::InvalidData => return Ok(true),
            Err(error) => return Err(error),
            Ok(_) => {}
        }
    }

    Ok(false)
}
