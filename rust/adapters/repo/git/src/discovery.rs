use crate::{adapter::GitRepoAdapter, case, exec};
use envden_core::{adapters::*, errors::Result};
use envden_protocol::protocol::files::validate_path;
use std::{collections::HashSet, fs, path::Path};
use unicode_normalization::UnicodeNormalization;

pub(crate) fn tracked(adapter: &GitRepoAdapter, checkout: &ICheckout, path: &str) -> Result<bool> {
    let insensitive = case::insensitive(&checkout.root, false)?;
    let key = |s: &str| {
        let s: String = s.nfc().collect();
        if insensitive { s.to_lowercase() } else { s }
    };
    Ok(adapter
        .git(&checkout.root, &["ls-files", "-z"], None)?
        .split('\0')
        .any(|s| key(s) == key(path)))
}

pub(crate) fn files(
    adapter: &GitRepoAdapter,
    checkout: &ICheckout,
    rules: Option<&IEnvFileRules>,
) -> Result<Vec<String>> {
    let insensitive = case::insensitive(&checkout.root, false)?;
    let key = |s: &str| {
        let s: String = s.nfc().collect();
        if insensitive { s.to_lowercase() } else { s }
    };
    let output = adapter.git(&checkout.root, &["ls-files", "--stage", "-z"], None)?;
    let entries: Vec<_> = output.split('\0').filter(|s| !s.is_empty()).collect();
    let submodules: HashSet<_> = entries
        .iter()
        .filter(|s| s.starts_with("160000 "))
        .filter_map(|s| s.split_once('\t').map(|(_, v)| v))
        .collect();
    let tracked: HashSet<_> = entries
        .iter()
        .filter_map(|s| s.split_once('\t').map(|(_, v)| key(v)))
        .collect();
    let mut files = Vec::new();
    walk(&checkout.root, "", rules, &submodules, &mut files)?;
    files.retain(|s| !tracked.contains(&key(s)));
    if files.is_empty() {
        return Ok(files);
    }
    match adapter.git(
        &checkout.root,
        &["check-ignore", "--stdin", "-z"],
        Some(&(files.join("\0") + "\0")),
    ) {
        Ok(output) => {
            let mut files: Vec<_> = output
                .split('\0')
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
                .collect();
            files.sort();
            Ok(files)
        }
        Err(e) if exec::exit(&e) == Some(1) => Ok(Vec::new()),
        Err(e) => Err(e),
    }
}

fn walk(
    root: &str,
    dir: &str,
    rules: Option<&IEnvFileRules>,
    submodules: &HashSet<&str>,
    files: &mut Vec<String>,
) -> Result<()> {
    let entries = match fs::read_dir(Path::new(root).join(dir)) {
        Ok(e) => e,
        Err(e) if !dir.is_empty() && e.kind() == std::io::ErrorKind::PermissionDenied => {
            return Ok(());
        }
        Err(e) => return Err(exec::failure(e)),
    };
    let mut entries = entries
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(exec::failure)?;
    entries.sort_by_key(|e| e.file_name());
    if !dir.is_empty() && entries.iter().any(|e| e.file_name() == ".git") {
        return Ok(());
    }
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = if dir.is_empty() {
            name
        } else {
            format!("{dir}/{name}")
        };
        if submodules.contains(path.as_str()) || validate_path(&path).is_err() {
            continue;
        }
        let kind = entry.file_type().map_err(exec::failure)?;
        if kind.is_dir() {
            let descend = IEnvFileRules {
                extra_skipped: rules.and_then(|r| r.extra_skipped.clone()),
                ..Default::default()
            };
            if accepts_env_path(&format!("{path}/.env"), Some(&descend)) {
                walk(root, &path, rules, submodules, files)?;
            }
        } else if (kind.is_file() || kind.is_symlink()) && accepts_env_path(&path, rules) {
            files.push(path);
        }
    }
    Ok(())
}
