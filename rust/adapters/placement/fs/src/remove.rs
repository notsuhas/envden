use crate::{adapter::FsPlacementAdapter, native, paths};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use rustix::fs::*;
use std::path::Path;

impl FsPlacementAdapter {
    pub(crate) fn remove_with_hook(
        &self,
        store: Option<&str>,
        dest: &str,
        before_unlink: impl FnOnce(),
    ) -> Result<()> {
        let relative = paths::relative(&self.root, dest, false)?;
        if !self.root.exists() {
            return Ok(());
        }
        let fd = match native::parent(&self.root, &relative, false) {
            Ok(fd) => fd,
            Err(e) if e.code == ErrorCode::NotFound => return Ok(()),
            Err(e) => return Err(e),
        };
        let name = relative.file_name().unwrap().to_str().unwrap();
        let before = native::identity(&fd, name)?;
        if before.is_none() {
            return Ok(());
        }
        if let Ok(target) = readlinkat(&fd, name, Vec::new()) {
            if !store.is_some_and(|s| {
                paths::same_target(
                    &self
                        .root
                        .join(relative.parent().unwrap())
                        .join(target.to_string_lossy().as_ref()),
                    Path::new(s),
                )
            }) {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidInput,
                    "Refusing an unrelated symlink",
                ));
            }
        } else {
            native::read(&fd, name, false)?;
        }
        native::assert_identity(&fd, name, &before)?;
        before_unlink();
        unlinkat(&fd, name, AtFlags::empty()).map_err(native::failure)
    }
}
