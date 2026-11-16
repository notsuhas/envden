use crate::state::records::read_sync_record;
use envden_core::errors::{ErrorCode, Result};
use std::path::Path;

pub(super) fn invalid_record<T>(path: &Path, decode: impl Fn(&str) -> Result<T>) -> Result<bool> {
    match read_sync_record(path, decode) {
        Err(error) if error.code == ErrorCode::InvalidData => Ok(true),
        Err(error) => Err(error),
        Ok(_) => Ok(false),
    }
}
