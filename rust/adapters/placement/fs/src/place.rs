use crate::{adapter::FsPlacementAdapter, backup, native, paths};
use envden_core::{
    adapters::*,
    errors::{EnvdenError, ErrorCode, Result},
};
use rustix::fs::*;
use sha2::{Digest, Sha256};
use std::path::Path;

impl FsPlacementAdapter {
    pub(crate) fn place_with_hook(
        &self,
        store: &str,
        dest: &str,
        prepare: Option<TPrepareTemporary<'_>>,
        replacing: Option<&str>,
        before_rename: impl FnOnce(),
    ) -> Result<()> {
        let relative = paths::relative(&self.root, dest, true)?;
        let text = relative.to_string_lossy();
        let temp = format!(".envden-{:x}", Sha256::digest(text.as_bytes()));
        if self.mode == TPlacementMode::Copy {
            prepare.ok_or_else(|| {
                EnvdenError::new(
                    ErrorCode::InvalidInput,
                    "Copy placement requires a temporary file exclude",
                )
            })?(&relative.parent().unwrap().join(&temp).to_string_lossy())?;
        }
        let fd = native::parent(&self.root, &relative, true)?;
        let name = relative.file_name().unwrap().to_str().unwrap();
        let before = native::identity(&fd, name)?;
        let target = readlinkat(&fd, name, Vec::new()).ok();
        if let Some(target) = &target {
            let target = target.to_string_lossy();
            if Some(target.as_ref()) != replacing
                && !paths::same_target(
                    &self
                        .root
                        .join(relative.parent().unwrap())
                        .join(target.as_ref()),
                    Path::new(store),
                )
            {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidInput,
                    "Refusing an unrelated symlink",
                ));
            }
        }
        let previous = if before.is_some() && target.is_none() {
            Some(native::read(&fd, name, false)?)
        } else {
            None
        };
        let contents = native::read(CWD, store, true)?;
        if native::identity(&fd, &temp)?.is_some() {
            unlinkat(&fd, &temp, AtFlags::empty()).map_err(native::failure)?;
        }
        if self.mode == TPlacementMode::Link {
            symlinkat(paths::absolute(Path::new(store)), &fd, &temp).map_err(native::failure)?;
        } else {
            native::write(&fd, &temp, &contents)?;
        }
        let staged = native::identity(&fd, &temp)?;
        let result = (|| {
            native::assert_identity(&fd, name, &before)?;
            if let Some(previous) = previous
                && previous != contents
            {
                backup::backup(&self.root, self.backup.as_deref(), &previous, (self.now)())?;
            }
            native::assert_identity(&fd, name, &before)?;
            native::assert_identity(&fd, &temp, &staged)?;
            before_rename();
            renameat(&fd, &temp, &fd, name).map_err(native::failure)
        })();
        if native::same(&staged, &native::identity(&fd, &temp)?) {
            unlinkat(&fd, &temp, AtFlags::empty()).map_err(native::failure)?;
        }
        result
    }
}
