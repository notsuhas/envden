use crate::state::files::failure;
use envden_core::errors::Result;
use std::{fs, path::Path};

pub(super) fn symlink_probe(directory: &Path) -> Result<bool> {
    let builder = fs::DirBuilder::new();
    #[cfg(unix)]
    let builder = {
        use std::os::unix::fs::DirBuilderExt;
        let mut builder = builder;
        builder.mode(0o700);
        builder
    };
    builder.create(directory).map_err(failure)?;

    Ok((|| -> std::io::Result<()> {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        drop(options.open(directory.join("target"))?);
        #[cfg(unix)]
        std::os::unix::fs::symlink(directory.join("target"), directory.join("link"))?;
        #[cfg(windows)]
        std::os::windows::fs::symlink_file(directory.join("target"), directory.join("link"))?;
        Ok(())
    })()
    .is_ok())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn doctor_probe_is_private() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("doctor-probe");
        assert!(symlink_probe(&directory).unwrap());
        assert_eq!(
            fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(directory.join("target"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}
