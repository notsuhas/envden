use crate::edit::failure;
use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    filesystem::{IFileIdentity, path_identity},
};
use std::path::Path;

pub(crate) fn baseline(path: &Path, opened: &IFileIdentity) -> Result<IFileIdentity> {
    let expected = path_identity(path).map_err(failure)?;
    if opened.device != expected.device || opened.inode != expected.inode {
        return Err(EnvdenError::new(
            ErrorCode::Conflict,
            "Shell configuration changed during editing",
        ));
    }
    Ok(expected)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn baseline_uses_path_timestamps_when_opened_timestamps_round() {
        let home = tempfile::tempdir().unwrap();
        let path = home.path().join("rc");
        std::fs::write(&path, "original").unwrap();
        let file = std::fs::File::open(&path).unwrap();
        let mut opened = envden_core::filesystem::file_identity(&file).unwrap();
        opened.changed_ns = opened.changed_ns.div_euclid(1_000_000) * 1_000_000 - 125_000;
        assert_eq!(
            baseline(&path, &opened).unwrap().changed_ns,
            path_identity(&path).unwrap().changed_ns
        );
    }
}
