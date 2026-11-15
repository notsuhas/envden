use crate::exec::failure;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::{
    fs::{self, OpenOptions},
    path::Path,
};

pub(crate) fn insensitive(root: &str, read_only: bool) -> Result<bool> {
    let names: Vec<_> = fs::read_dir(root)
        .map_err(failure)?
        .map(|e| e.map(|e| e.file_name().to_string_lossy().into_owned()))
        .collect::<std::io::Result<_>>()
        .map_err(failure)?;
    let mut names = names;
    names.sort();
    for name in &names {
        let Some((i, c)) = name.char_indices().find(|(_, c)| c.is_ascii_alphabetic()) else {
            continue;
        };
        let mut alternate = name.clone();
        alternate.replace_range(
            i..i + 1,
            &if c.is_ascii_lowercase() {
                c.to_ascii_uppercase()
            } else {
                c.to_ascii_lowercase()
            }
            .to_string(),
        );
        if names.contains(&alternate) {
            return Ok(false);
        }
        return compare(
            &Path::new(root).join(name),
            &Path::new(root).join(alternate),
        );
    }
    if read_only {
        return Err(EnvdenError::new(
            ErrorCode::NotImplemented,
            "Filesystem case behavior requires a writable probe",
        ));
    }
    let name = format!(".envden-case-{}", uuid::Uuid::new_v4());
    let path = Path::new(root).join(&name);
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&path)
        .map_err(failure)?;
    let result = compare(&path, &Path::new(root).join(name.to_uppercase()));
    drop(file);
    fs::remove_file(path).map_err(failure)?;
    result
}

fn compare(original: &Path, alternate: &Path) -> Result<bool> {
    let original = fs::symlink_metadata(original).map_err(failure)?;
    match fs::symlink_metadata(alternate) {
        Ok(info) => Ok(info.dev() == original.dev() && info.ino() == original.ino()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(failure(e)),
    }
}
