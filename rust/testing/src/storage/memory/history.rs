use super::data::*;
use envden_core::{adapters::*, errors::Result};
use std::collections::{BTreeMap, BTreeSet};
impl IMemory {
    pub(super) fn prune_inner(
        &self,
        vault_id: &[u8],
        policy: &IHistoryPolicy,
        now: u64,
    ) -> Result<IPruneResult> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        if policy.min_versions < 1 {
            return Err(fail("Invalid history policy"));
        }
        if d.depth > 0 {
            return Err(fail("Pruning must run outside an application transaction"));
        }
        let lists: Vec<_> = d
            .lists
            .iter()
            .filter(|((v, _), _)| v == vault_id)
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        let mut versions = BTreeMap::<Vec<u8>, BTreeSet<u64>>::new();
        for (_, (files, _, _)) in &lists {
            for v in &files.versions {
                versions
                    .entry(v.file_id.clone())
                    .or_default()
                    .insert(v.version);
            }
        }
        let ranked = |v: &IFileVersion| {
            versions.get(&v.file_id).is_some_and(|vs| {
                vs.iter()
                    .rev()
                    .take(policy.min_versions)
                    .any(|n| *n == v.version)
            })
        };
        let mut retained = BTreeMap::new();
        let mut candidates = BTreeSet::new();
        for (key, (files, _, _)) in &lists {
            for v in &files.versions {
                if ranked(v) {
                    let version_key = (v.file_id.clone(), v.version);
                    let prior = retained.entry(version_key).or_insert_with(|| key.clone());
                    if key < prior {
                        *prior = key.clone();
                    }
                }
                if let Some(hash) = &v.blob_hash {
                    candidates.insert(hash.clone());
                }
            }
        }
        let mut removed_lists = 0;
        for (key, (_, at, permanent)) in &lists {
            if (*at as i128) < now as i128 - policy.max_age as i128
                && !permanent
                && d.current.get(vault_id) != Some(&key.1)
                && !retained.values().any(|v| v == key)
            {
                d.lists.shift_remove(key);
                removed_lists += 1;
            }
        }
        let mut kept = BTreeSet::new();
        for ((v, _), (files, at, _)) in &d.lists {
            if v == vault_id {
                for version in &files.versions {
                    if ((*at as i128) >= now as i128 - policy.max_age as i128 || ranked(version))
                        && let Some(hash) = &version.blob_hash
                    {
                        kept.insert(hash.clone());
                    }
                }
            }
        }
        for ((v, h), (_, at)) in &d.blobs {
            if v == vault_id && (*at as i128) < now as i128 - 86400000 && !kept.contains(h) {
                candidates.insert(h.clone());
            }
        }
        let mut blobs = 0;
        for hash in candidates {
            if !kept.contains(&hash) && d.blobs.shift_remove(&pair(vault_id, &hash)).is_some() {
                blobs += 1;
            }
        }
        Ok(IPruneResult {
            lists: removed_lists,
            blobs,
        })
    }
}
