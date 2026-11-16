#[cfg(unix)]
use crate::native;
use crate::paths;
#[cfg(windows)]
use crate::windows::state as native;
use envden_core::{
    adapters::*,
    errors::{EnvdenError, ErrorCode, Result},
};
use std::{fs, path::Path};
pub(crate) fn inspect(
    root: &Path,
    mode: TPlacementMode,
    store: &str,
    dest: &str,
) -> Result<TPlacementState> {
    let relative = paths::relative(root, dest, false)?;
    let mut parent = root.to_owned();
    for part in std::iter::once(std::ffi::OsStr::new("")).chain(
        relative
            .parent()
            .unwrap()
            .components()
            .map(|c| c.as_os_str()),
    ) {
        if !part.is_empty() {
            parent.push(part);
        }
        let info = match fs::symlink_metadata(&parent) {
            Ok(m) => m,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound && parent != root => {
                return Ok(TPlacementState::Missing);
            }
            Err(e) => return Err(native::failure(e)),
        };
        if !info.is_dir() || info.is_symlink() {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                if parent == root {
                    "Unsafe checkout root"
                } else {
                    "Unsafe checkout parent"
                },
            ));
        }
    }
    let info = match fs::symlink_metadata(dest) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(TPlacementState::Missing);
        }
        Err(e) => return Err(native::failure(e)),
    };
    if info.is_symlink() {
        return Ok(
            if paths::same_target(
                &Path::new(dest)
                    .parent()
                    .unwrap()
                    .join(fs::read_link(dest).map_err(native::failure)?),
                Path::new(store),
            ) {
                TPlacementState::Linked
            } else {
                TPlacementState::Detached
            },
        );
    }
    if !info.is_file() {
        return Ok(TPlacementState::Detached);
    }
    match Path::new(store).symlink_metadata() {
        Ok(_) => (),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(TPlacementState::Detached);
        }
        Err(error) => return Err(native::failure(error)),
    }
    if fs::read(dest).map_err(native::failure)? != fs::read(store).map_err(native::failure)? {
        return Ok(TPlacementState::Detached);
    }
    Ok(if mode == TPlacementMode::Link {
        TPlacementState::Relinkable
    } else {
        TPlacementState::Linked
    })
}
