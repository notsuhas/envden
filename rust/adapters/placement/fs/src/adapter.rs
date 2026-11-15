use crate::{backup, native, paths};
use envden_core::{
    adapters::*,
    errors::{EnvdenError, ErrorCode, Result},
};
use rustix::fs::*;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub struct FsPlacementAdapter {
    mode: TPlacementMode,
    root: PathBuf,
    backup: Option<PathBuf>,
    now: Box<dyn Fn() -> f64 + Send + Sync>,
}

pub fn create_fs_placement_adapter(
    mode: TPlacementMode,
    root: impl AsRef<Path>,
    backup: Option<&Path>,
    now: impl Fn() -> f64 + Send + Sync + 'static,
) -> FsPlacementAdapter {
    FsPlacementAdapter {
        mode,
        root: paths::absolute(root.as_ref()),
        backup: backup.map(Path::to_owned),
        now: Box::new(now),
    }
}

impl IPlacementAdapter for FsPlacementAdapter {
    fn mode(&self) -> TPlacementMode {
        self.mode
    }
    fn supported(&self, dir: &str) -> Result<bool> {
        if self.mode == TPlacementMode::Copy {
            return Ok(true);
        }
        let path = Path::new(dir).join(format!(".envden-probe-{}", uuid::Uuid::new_v4()));
        let result = symlinkat(".envden-probe-target", CWD, &path).is_ok();
        match fs::remove_file(path) {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(native::failure(e)),
        }
        Ok(result)
    }
    fn place(
        &self,
        store: &str,
        dest: &str,
        prepare: Option<TPrepareTemporary<'_>>,
        replacing: Option<&str>,
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
            renameat(&fd, &temp, &fd, name).map_err(native::failure)
        })();
        if native::same(&staged, &native::identity(&fd, &temp)?) {
            unlinkat(&fd, &temp, AtFlags::empty()).map_err(native::failure)?;
        }
        result
    }
    fn remove(&self, store: Option<&str>, dest: &str) -> Result<()> {
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
        unlinkat(&fd, name, AtFlags::empty()).map_err(native::failure)
    }
    fn inspect(&self, store: &str, dest: &str) -> Result<TPlacementState> {
        crate::inspect::inspect(&self.root, self.mode, store, dest)
    }
}
