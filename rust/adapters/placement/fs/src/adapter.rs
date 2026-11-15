use crate::{native, paths};
use envden_core::{adapters::*, errors::Result};
use rustix::fs::*;
use std::{
    fs,
    path::{Path, PathBuf},
};

pub struct FsPlacementAdapter {
    pub(crate) mode: TPlacementMode,
    pub(crate) root: PathBuf,
    pub(crate) backup: Option<PathBuf>,
    pub(crate) now: Box<dyn Fn() -> f64 + Send + Sync>,
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
        self.place_with_hook(store, dest, prepare, replacing, || {})
    }
    fn remove(&self, store: Option<&str>, dest: &str) -> Result<()> {
        self.remove_with_hook(store, dest, || {})
    }
    fn inspect(&self, store: &str, dest: &str) -> Result<TPlacementState> {
        crate::inspect::inspect(&self.root, self.mode, store, dest)
    }
}
