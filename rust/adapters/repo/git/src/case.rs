use crate::exec::failure;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_core::filesystem::path_identity;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
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
    match probe(&names) {
        Probe::Sensitive => return Ok(false),
        Probe::Compare(name, alternate) => {
            return compare(
                &Path::new(root).join(name),
                &Path::new(root).join(alternate),
            );
        }
        Probe::Empty => (),
    }
    if read_only {
        return Err(EnvdenError::new(
            ErrorCode::NotImplemented,
            "Filesystem case behavior requires a writable probe",
        ));
    }
    let name = format!(".envden-case-{}", uuid::Uuid::new_v4());
    let path = Path::new(root).join(&name);
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let file = options.open(&path).map_err(failure)?;
    let result = compare(&path, &Path::new(root).join(name.to_uppercase()));
    drop(file);
    fs::remove_file(path).map_err(failure)?;
    result
}

fn compare(original: &Path, alternate: &Path) -> Result<bool> {
    let original = path_identity(original).map_err(failure)?;
    match path_identity(alternate) {
        Ok(info) => Ok(info.device == original.device && info.inode == original.inode),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(failure(e)),
    }
}

#[derive(Debug, PartialEq)]
enum Probe {
    Sensitive,
    Compare(String, String),
    Empty,
}

fn probe(names: &[String]) -> Probe {
    let mut names = names.to_vec();
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
            return Probe::Sensitive;
        }
        return Probe::Compare(name.clone(), alternate);
    }
    Probe::Empty
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn probes_existing_spelling_and_listed_aliases() {
        assert_eq!(
            probe(&["123".into(), ".git".into()]),
            Probe::Compare(".git".into(), ".Git".into())
        );
        assert_eq!(probe(&["abc".into(), "Abc".into()]), Probe::Sensitive);
        assert_eq!(probe(&["123".into()]), Probe::Empty);
    }
}
