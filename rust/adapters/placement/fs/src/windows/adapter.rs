use super::{place, state};
use crate::{inspect, paths};
use envden_core::{adapters::*, errors::Result};
use std::{
    fs,
    os::windows::fs::symlink_file,
    path::{Path, PathBuf},
};

pub struct FsPlacementAdapter {
    pub(super) mode: TPlacementMode,
    pub(super) root: PathBuf,
    pub(super) backup: Option<PathBuf>,
    pub(super) now: Box<dyn Fn() -> f64 + Send + Sync>,
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
        let result = symlink_file(".envden-probe-target", &path).is_ok();
        match fs::remove_file(path) {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(state::failure(e)),
        }
        Ok(result)
    }
    fn place(
        &self,
        store: &str,
        destination: &str,
        prepare: Option<TPrepareTemporary<'_>>,
        replacing: Option<&str>,
    ) -> Result<()> {
        place::place(self, store, destination, prepare, replacing)
    }
    fn inspect(&self, store: &str, destination: &str) -> Result<TPlacementState> {
        inspect::inspect(&self.root, self.mode, store, destination)
    }
    fn remove(&self, store: Option<&str>, destination: &str) -> Result<()> {
        let relative = paths::relative(&self.root, destination, false)?;
        let destination = Path::new(destination);
        let Some(parents) = state::parents(&self.root, &relative, false)? else {
            return Ok(());
        };
        let Some(info) = state::stat(destination)? else {
            return Ok(());
        };
        if info.is_symlink() {
            if !store.is_some_and(|s| {
                fs::read_link(destination).is_ok_and(|link| {
                    paths::same_target(&destination.parent().unwrap().join(link), Path::new(s))
                })
            }) {
                return Err(state::invalid("Refusing an unrelated symlink"));
            }
        } else if !info.is_file() {
            return Err(state::invalid("Destination is not a file"));
        }
        state::verify(&parents, destination)?;
        fs::remove_file(destination).map_err(state::failure)
    }
}
