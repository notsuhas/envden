use super::{
    directories::{fixed_directories, manager_roots, platform},
    roots::inside_untrusted_root,
};
use crate::errors::{EnvdenError, ErrorCode, Result};
use std::path::{Path, PathBuf};
pub fn inside_working_tree(path: impl AsRef<Path>, exceptions: Option<&[String]>) -> bool {
    inside_working_tree_with(path.as_ref(), exceptions, |p| p.exists())
}

pub(crate) fn inside_working_tree_with(
    path: &Path,
    exceptions: Option<&[String]>,
    exists: impl Fn(&Path) -> bool,
) -> bool {
    if inside_untrusted_root(path) {
        return true;
    }
    let defaults = manager_roots(
        platform(),
        if cfg!(target_arch = "aarch64") {
            "arm64"
        } else {
            "x64"
        },
    );
    let exceptions = exceptions.unwrap_or(&defaults);
    for dir in path.ancestors() {
        if exists(&dir.join(".git")) && !exceptions.iter().any(|e| Path::new(e) == dir) {
            return true;
        }
    }
    false
}
pub fn trusted_owner_and_mode(
    mode: u32,
    uid: u32,
    gid: u32,
    platform: &str,
    current_uid: u32,
) -> bool {
    if platform == "win32" {
        return true;
    }
    mode & 0o002 == 0
        && (mode & 0o020 == 0 || gid == 0 || (platform == "darwin" && gid == 80))
        && (uid == 0 || uid == current_uid)
}
fn trusted_metadata(info: &std::fs::Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        trusted_owner_and_mode(
            info.mode(),
            info.uid(),
            info.gid(),
            platform(),
            rustix::process::getuid().as_raw(),
        )
    }
    #[cfg(not(unix))]
    {
        let _ = info;
        true
    }
}
fn trusted_directory(path: &Path) -> bool {
    if !path.is_absolute() {
        return false;
    }
    let Ok(canonical) = path.canonicalize() else {
        return false;
    };
    if inside_working_tree(path, None) || inside_working_tree(&canonical, None) {
        return false;
    }
    canonical
        .metadata()
        .is_ok_and(|i| i.is_dir() && trusted_metadata(&i))
}
pub fn trusted_directories(
    directories: Option<&[String]>,
    manager_bin: Option<&str>,
) -> Vec<String> {
    let defaults = fixed_directories(platform());
    let mut result = Vec::new();
    for dir in directories
        .unwrap_or(&defaults)
        .iter()
        .map(String::as_str)
        .chain(manager_bin)
    {
        if !result.iter().any(|s| s == dir) && trusted_directory(Path::new(dir)) {
            result.push(dir.to_owned());
        }
    }
    result
}
pub fn resolve_trusted_executable(name: &str) -> Result<PathBuf> {
    resolve_with_directories(name, None)
}

pub(crate) fn resolve_with_directories(
    name: &str,
    directories: Option<&[String]>,
) -> Result<PathBuf> {
    let current = std::env::current_exe().map_err(|e| {
        EnvdenError::with_source(ErrorCode::InvalidInput, "Trusted executable unavailable", e)
    })?;
    if name == "bun" || Path::new(name) == current {
        return Ok(current);
    }
    let path = Path::new(name);
    let candidates = if path.is_absolute() {
        vec![path.to_owned()]
    } else if path.file_name().is_some_and(|s| s == name) {
        trusted_directories(directories, None)
            .into_iter()
            .flat_map(|dir| {
                let base = Path::new(&dir).join(name);
                if cfg!(windows) && path.extension().is_none() {
                    vec![
                        base.clone(),
                        base.with_extension("exe"),
                        base.with_extension("com"),
                    ]
                } else {
                    vec![base]
                }
            })
            .collect()
    } else {
        vec![]
    };
    for candidate in candidates {
        let Ok(real) = candidate.canonicalize() else {
            continue;
        };
        let Ok(info) = real.metadata() else {
            continue;
        };
        if !candidate.parent().is_some_and(trusted_directory)
            || !real.parent().is_some_and(trusted_directory)
            || !info.is_file()
            || !trusted_metadata(&info)
        {
            continue;
        }
        #[cfg(unix)]
        if rustix::fs::access(&real, rustix::fs::Access::EXEC_OK).is_err() {
            continue;
        }
        return Ok(real);
    }
    Err(EnvdenError::new(
        ErrorCode::InvalidInput,
        "Trusted executable unavailable",
    ))
}
