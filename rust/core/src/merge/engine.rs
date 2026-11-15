use super::{
    layout::{assemble, layout_changed, line_ending},
    parser::parse_env,
    selection::{entry_bytes, select_entry},
    types::*,
};
use std::collections::BTreeMap;
pub(super) fn keys(files: &[IParsedEnv]) -> Vec<String> {
    let mut keys = Vec::new();
    for f in files {
        for e in &f.entries {
            if !keys.contains(&e.key) {
                keys.push(e.key.clone());
            }
        }
    }
    keys
}
pub(super) fn entry<'a>(f: &'a IParsedEnv, key: &str) -> Option<&'a IEnvEntry> {
    f.entries.iter().find(|e| e.key == key)
}
pub(super) fn parse_sides(
    base: &[u8],
    local: &[u8],
    remote: &[u8],
) -> Result<[IParsedEnv; 3], TConflict> {
    Ok([parse_env(base)?, parse_env(local)?, parse_env(remote)?])
}
fn shortcut(base: &[u8], chosen: &[u8]) -> TMergeResult {
    let mut changed_keys = Vec::new();
    if let (Ok(b), Ok(a)) = (parse_env(base), parse_env(chosen)) {
        let files = [b, a];
        for key in keys(&files) {
            if entry_bytes(entry(&files[0], &key)) != entry_bytes(entry(&files[1], &key)) {
                changed_keys.push(key);
            }
        }
    }
    Ok(ICleanMerge {
        bytes: chosen.to_vec(),
        changed_keys,
    })
}
pub fn merge_env(base: &[u8], local: &[u8], remote: &[u8]) -> TMergeResult {
    if base == local {
        return shortcut(base, remote);
    }
    if base == remote || local == remote {
        return shortcut(base, local);
    }
    let files = parse_sides(base, local, remote)?;
    let mut selected = BTreeMap::new();
    let mut changed_keys = Vec::new();
    for key in keys(&files) {
        let (changed, e) = select_entry(
            &key,
            entry(&files[0], &key),
            entry(&files[1], &key),
            entry(&files[2], &key),
        )?;
        if changed {
            changed_keys.push(key.clone());
        }
        if let Some(e) = e {
            selected.insert(key, e.clone());
        }
    }
    if layout_changed(&files) {
        return Err(TConflict {
            reason: "layout-change",
            key: None,
        });
    }
    Ok(ICleanMerge {
        bytes: assemble(&files, &selected, line_ending(&[local, base, remote]), &[]),
        changed_keys,
    })
}
pub fn diff_env_keys(before: &[u8], after: &[u8]) -> Result<IEnvDiff, TConflict> {
    let a = parse_env(before)?;
    let b = parse_env(after)?;
    Ok(IEnvDiff {
        added: b
            .entries
            .iter()
            .filter(|e| entry(&a, &e.key).is_none())
            .map(|e| e.key.clone())
            .collect(),
        removed: a
            .entries
            .iter()
            .filter(|e| entry(&b, &e.key).is_none())
            .map(|e| e.key.clone())
            .collect(),
        changed: b
            .entries
            .iter()
            .filter(|e| {
                entry(&a, &e.key).is_some()
                    && entry_bytes(entry(&a, &e.key)) != entry_bytes(Some(e))
            })
            .map(|e| e.key.clone())
            .collect(),
    })
}
