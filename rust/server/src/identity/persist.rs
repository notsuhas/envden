use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::Path,
};

pub(super) fn io_error(error: std::io::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::Internal, "Server identity I/O failed", error)
}

pub(super) fn restrict(path: &Path, directory: bool) -> Result<()> {
    #[cfg(test)]
    tests::RESTRICTED.with_borrow_mut(|calls| calls.push((path.to_path_buf(), directory)));
    envden_core::process::restrict_access(path, directory)
}

pub(super) fn persist_identity(directory: &Path, data: &[u8]) -> Result<()> {
    let temporary = directory.join(format!(".identity-{}", uuid::Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temporary).map_err(io_error)?;
    file.write_all(data).map_err(io_error)?;
    publish(
        || {
            file.sync_all().map_err(io_error)?;
            drop(file);
            Ok(())
        },
        || fs::hard_link(&temporary, directory.join("identity.json")).map_err(io_error),
        || sync_directory(directory),
        || fs::remove_file(&temporary).map_err(io_error),
    )
}

fn sync_directory(_directory: &Path) -> Result<()> {
    #[cfg(unix)]
    File::open(_directory)
        .and_then(|directory| directory.sync_all())
        .map_err(io_error)?;

    Ok(())
}

fn publish(
    sync_file: impl FnOnce() -> Result<()>,
    link: impl FnOnce() -> Result<()>,
    sync_directory: impl FnOnce() -> Result<()>,
    remove: impl FnOnce() -> Result<()>,
) -> Result<()> {
    sync_file()?;
    let result = link().and_then(|_| sync_directory());
    let removed = remove();

    result.and(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    thread_local! {
        pub(super) static RESTRICTED:RefCell<Vec<(std::path::PathBuf,bool)>>=const {RefCell::new(Vec::new())};
    }

    #[test]
    fn identity_folder_and_key_use_shared_acl_helper() {
        let directory = tempfile::tempdir().unwrap();
        crate::identity::load_server_keys(directory.path()).unwrap();
        RESTRICTED.with_borrow_mut(Vec::clear);
        crate::identity::load_server_keys(directory.path()).unwrap();
        RESTRICTED.with_borrow(|calls| {
            assert_eq!(
                calls,
                &vec![
                    (directory.path().to_path_buf(), true),
                    (directory.path().join("identity.json"), false)
                ]
            )
        });
    }

    #[test]
    fn identity_publication_syncs_file_before_link_then_directory() {
        for failure in [None, Some("file"), Some("link"), Some("directory")] {
            let calls = RefCell::new(vec![]);
            let step = |name| {
                calls.borrow_mut().push(name);
                if failure == Some(name) {
                    Err(EnvdenError::new(ErrorCode::Internal, "Injected failure"))
                } else {
                    Ok(())
                }
            };
            let result = publish(
                || step("file"),
                || step("link"),
                || step("directory"),
                || step("remove"),
            );
            assert_eq!(result.is_err(), failure.is_some());
            let expected = match failure {
                Some("file") => vec!["file"],
                Some("link") => vec!["file", "link", "remove"],
                _ => vec!["file", "link", "directory", "remove"],
            };
            assert_eq!(*calls.borrow(), expected);
        }
    }
}
