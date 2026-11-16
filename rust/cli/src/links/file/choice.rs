use envden_core::errors::Result;
use std::io::{self, IsTerminal};

pub(super) fn choose_version(path: &str) -> Result<String> {
    if !io::stdin().is_terminal() {
        return Ok("skip".into());
    }
    crate::output::prompts::choose(
        &format!("{path} differs from the synced copy"),
        &[
            ("separate".into(), "Keep separate (local only)".into()),
            ("store".into(), "Use the synced version".into()),
        ],
        None,
    )
}

pub(super) fn read_store(
    store: &std::path::Path,
    read: impl FnOnce(&std::path::Path) -> std::io::Result<Vec<u8>>,
) -> Result<Option<Vec<u8>>> {
    use crate::state::files::failure;
    use envden_core::errors::{EnvdenError, ErrorCode};
    match std::fs::symlink_metadata(store) {
        Ok(meta) if !meta.is_file() || meta.is_symlink() => Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Unsafe store file",
        )),
        Ok(_) => match read(store) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(failure(e)),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(failure(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disappearing_store_is_treated_as_absent_after_stat() {
        let temp = tempfile::tempdir().unwrap();
        let store = temp.path().join("store");
        std::fs::write(&store, b"A=1").unwrap();
        assert_eq!(
            read_store(&store, |_| Err(std::io::ErrorKind::NotFound.into())).unwrap(),
            None
        );
    }
}
