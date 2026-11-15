use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_core::filesystem::ICanonicalPath;
use path_clean::PathClean;
use std::path::{Path, PathBuf};

pub(crate) fn absolute(path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.clean()
    } else {
        std::env::current_dir().unwrap().join(path).clean()
    }
}

pub(crate) fn relative(root: &Path, path: &str, pulled: bool) -> Result<PathBuf> {
    let unsafe_path = || EnvdenError::new(ErrorCode::InvalidInput, "Unsafe pulled path");
    if path.split(['/', '\\']).any(|s| s == "..") {
        return Err(unsafe_path());
    }
    let dest = absolute(Path::new(path));
    #[cfg(unix)]
    let rel = dest
        .strip_prefix(root)
        .map_err(|_| EnvdenError::new(ErrorCode::InvalidData, "Invalid relative path"))?
        .to_owned();
    #[cfg(windows)]
    let rel = relative_windows(root, &dest)?;
    let text = rel.to_string_lossy().replace('\\', "/");
    envden_protocol::protocol::files::validate_path(&text)?;
    if text
        .split('/')
        .any(|p| p.eq_ignore_ascii_case(".git") || regex_short(p))
        || (pulled && regex::Regex::new(r"\p{Cf}").unwrap().is_match(&text))
    {
        return Err(unsafe_path());
    }
    Ok(rel.to_owned())
}

fn regex_short(part: &str) -> bool {
    part.match_indices('~').any(|(i, _)| {
        let tail = &part[i + 1..];
        let n = tail.bytes().take_while(u8::is_ascii_digit).count();
        n > 0 && (tail.len() == n || tail.as_bytes()[n] == b'.')
    })
}

pub(crate) fn same_target(target: &Path, store: &Path) -> bool {
    absolute(target) == absolute(store)
        || target
            .canonical_path()
            .ok()
            .is_some_and(|p| Some(p) == store.canonical_path().ok())
}

#[cfg(windows)]
fn relative_windows(root: &Path, target: &Path) -> Result<PathBuf> {
    let root: Vec<_> = root.components().collect();
    let target: Vec<_> = target.components().collect();
    if root.len() > target.len()
        || !root.iter().zip(&target).all(|(a, b)| {
            a.as_os_str().to_string_lossy().to_lowercase()
                == b.as_os_str().to_string_lossy().to_lowercase()
        })
    {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Invalid relative path",
        ));
    }
    Ok(target[root.len()..].iter().map(|p| p.as_os_str()).collect())
}
