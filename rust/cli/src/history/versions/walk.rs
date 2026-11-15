use envden_core::errors::Result;
use envden_protocol::protocol::{IFileEntry, IFiles, IManifestHeader, ISigned, base32};
use std::collections::{BTreeMap, HashMap};

pub struct IWalkedVersion {
    pub entry: IFileEntry,
    pub header: Option<ISigned<IManifestHeader>>,
}

#[derive(Default)]
pub struct IWalk {
    pub versions: Vec<IWalkedVersion>,
    pub pruned: bool,
}

pub fn walk_versions(
    headers: &[ISigned<IManifestHeader>],
    file_ids: &[[u8; 32]],
    mut list: impl FnMut(&[u8; 32]) -> Result<Option<IFiles>>,
) -> Result<BTreeMap<String, IWalk>> {
    let mut walks: BTreeMap<_, _> = file_ids
        .iter()
        .map(|id| (base32(id), IWalk::default()))
        .collect();
    let mut open: Vec<_> = file_ids.iter().map(|id| (base32(id), *id)).collect();
    let mut lists = HashMap::new();
    for header in headers.iter().rev() {
        if open.is_empty() {
            break;
        }
        let hash = header.body.files_hash;
        if let std::collections::hash_map::Entry::Vacant(entry) = lists.entry(hash) {
            entry.insert(list(&hash)?);
        }
        let files = lists.get(&hash).and_then(Option::as_ref);
        open.retain(|(id, file_id)| {
            let Some(walk) = walks.get_mut(id) else {
                return false;
            };
            !step_walk(walk, header, files, file_id)
        });
    }
    Ok(walks)
}

fn step_walk(
    walk: &mut IWalk,
    header: &ISigned<IManifestHeader>,
    files: Option<&IFiles>,
    file_id: &[u8; 32],
) -> bool {
    let oldest = walk.versions.last_mut();
    let Some(files) = files else {
        walk.pruned = true;
        if let Some(oldest) = oldest {
            oldest.header = None;
        }
        return true;
    };
    let Some(entry) = files.entries.iter().find(|e| &e.file_id == file_id) else {
        return true;
    };
    if let Some(oldest) = oldest.filter(|v| v.entry.version == entry.version) {
        oldest.header = Some(header.clone());
    } else {
        walk.versions.push(IWalkedVersion {
            entry: entry.clone(),
            header: Some(header.clone()),
        });
    }
    false
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
