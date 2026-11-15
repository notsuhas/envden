use super::{adapter::FsPlacementAdapter, backup, state};
use crate::paths;
use envden_core::{
    adapters::*,
    errors::{EnvdenError, ErrorCode, Result},
    filesystem::file_identity,
    process::restrict_access,
};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    os::windows::fs::{OpenOptionsExt, symlink_file},
    path::Path,
};

pub(super) fn place(
    adapter: &FsPlacementAdapter,
    store: &str,
    destination: &str,
    prepare: Option<TPrepareTemporary<'_>>,
    replacing: Option<&str>,
) -> Result<()> {
    place_with_verify(
        adapter,
        store,
        destination,
        prepare,
        replacing,
        state::verify,
    )
}

pub(super) fn place_with_verify(
    adapter: &FsPlacementAdapter,
    store: &str,
    destination: &str,
    prepare: Option<TPrepareTemporary<'_>>,
    replacing: Option<&str>,
    mut verify: impl FnMut(
        &[(std::path::PathBuf, envden_core::filesystem::IFileIdentity)],
        &Path,
    ) -> Result<()>,
) -> Result<()> {
    let relative = paths::relative(&adapter.root, destination, true)?;
    let text = relative.to_string_lossy().replace('\\', "/");
    let name = format!(".envden-{:x}", Sha256::digest(text.as_bytes()));
    if adapter.mode == TPlacementMode::Copy {
        prepare
            .ok_or_else(|| state::invalid("Copy placement requires a temporary file exclude"))?(
            &relative
                .parent()
                .unwrap()
                .join(&name)
                .to_string_lossy()
                .replace('\\', "/"),
        )?;
    }
    state::parents(&adapter.root, &relative, true)?
        .ok_or_else(|| state::failure(std::io::Error::from(std::io::ErrorKind::NotFound)))?;
    let destination = paths::absolute(Path::new(destination));
    let store = Path::new(store);
    let parents = state::parents(&adapter.root, &relative, false)?.unwrap();
    let existing = state::stat(&destination)?;
    let before = state::identity(&destination)?;
    if existing.as_ref().is_some_and(|m| m.is_symlink()) {
        let target = fs::read_link(&destination).map_err(state::failure)?;
        if !paths::same_target(&destination.parent().unwrap().join(&target), store)
            && Some(target.to_string_lossy().as_ref()) != replacing
        {
            return Err(state::invalid("Refusing an unrelated symlink"));
        }
    }
    if existing
        .as_ref()
        .is_some_and(|m| !m.is_file() && !m.is_symlink())
    {
        return Err(state::invalid("Destination is not a file"));
    }
    let info = store.symlink_metadata().map_err(state::failure)?;
    if !info.is_file() || info.is_symlink() {
        return Err(state::invalid("Store source is not a regular file"));
    }
    restrict_access(store, false)?;
    let temporary = destination.parent().unwrap().join(name);
    match fs::remove_file(&temporary) {
        Ok(()) => (),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
        Err(e) => return Err(state::failure(e)),
    }
    let mut staged = None;
    let result = (|| {
        if adapter.mode == TPlacementMode::Link {
            symlink_file(paths::absolute(store), &temporary).map_err(state::failure)?;
            staged = state::identity(&temporary)?;
        } else {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .custom_flags(0x00200000)
                .open(&temporary)
                .map_err(state::failure)?;
            staged = Some(file_identity(&file).map_err(state::failure)?);
            restrict_access(&temporary, false)?;
            verify(&parents, &destination)?;
            let mut contents = Vec::new();
            state::read(store)?
                .read_to_end(&mut contents)
                .map_err(state::failure)?;
            file.write_all(&contents).map_err(state::failure)?;
        }
        verify(&parents, &destination)?;
        if let Some(existing) = &existing {
            let mut source = state::read(if existing.is_symlink() {
                store
            } else {
                &destination
            })?;
            if !existing.is_symlink()
                && !state::same(
                    &before,
                    &Some(file_identity(&source).map_err(state::failure)?),
                )
            {
                return Err(EnvdenError::new(
                    ErrorCode::Conflict,
                    "Destination changed before backup",
                ));
            }
            let mut contents = Vec::new();
            source.read_to_end(&mut contents).map_err(state::failure)?;
            let mut bytes = Vec::new();
            state::read(store)?
                .read_to_end(&mut bytes)
                .map_err(state::failure)?;
            verify(&parents, &destination)?;
            if contents != bytes {
                backup::backup(
                    &adapter.root,
                    adapter.backup.as_deref(),
                    &contents,
                    (adapter.now)(),
                )?;
            }
        }
        verify(&parents, &destination)?;
        if !state::same(&before, &state::identity(&destination)?) {
            return Err(EnvdenError::new(
                ErrorCode::Conflict,
                "Destination changed during placement",
            ));
        }
        let current = state::identity(&temporary)?;
        if staged
            .as_ref()
            .zip(current.as_ref())
            .is_none_or(|(a, b)| a.device != b.device || a.inode != b.inode)
        {
            return Err(EnvdenError::new(ErrorCode::Conflict, "Staged file changed"));
        }
        fs::rename(&temporary, &destination).map_err(state::failure)
    })();
    let leftover = state::identity(&temporary)?;
    if staged
        .as_ref()
        .zip(leftover.as_ref())
        .is_some_and(|(a, b)| a.device == b.device && a.inode == b.inode)
    {
        fs::remove_file(&temporary).map_err(state::failure)?;
    }
    result
}
