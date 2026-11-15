use super::super::data::*;
use envden_core::{adapters::*, errors::Result};

impl IMemory {
    pub(in crate::storage::memory) fn has_blob(
        &self,
        vault_id: &[u8],
        hash: &[u8],
    ) -> Result<bool> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.blobs.contains_key(&pair(vault_id, hash)))
    }

    pub(in crate::storage::memory) fn put_blob(
        &self,
        vault_id: &[u8],
        hash: &[u8],
        bytes: &[u8],
        verify: Option<TVerifyBlob<'_>>,
        now: Option<u64>,
        quota_bytes: Option<u64>,
    ) -> Result<()> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        if verify.is_some_and(|f| f(bytes) != hash) {
            return Err(fail("Blob hash mismatch"));
        }
        let key = pair(vault_id, hash);
        let prior = d.blobs.get(&key);
        if prior.is_some_and(|(b, _)| b != bytes) {
            return Err(fail("Conflicting blob"));
        }
        let used: usize = d
            .blobs
            .iter()
            .filter(|((v, _), _)| v == vault_id)
            .map(|(_, (b, _))| b.len())
            .sum();
        if used - prior.map(|(b, _)| b.len()).unwrap_or(0) + bytes.len()
            > quota_bytes.unwrap_or(VAULT_QUOTA_BYTES) as usize
        {
            return Err(envden_core::errors::EnvdenError::new(
                envden_core::errors::ErrorCode::StorageQuota,
                "Vault storage quota exceeded",
            ));
        }
        d.blobs.insert(key, (bytes.to_vec(), now.unwrap_or(0)));
        Ok(())
    }

    pub(in crate::storage::memory) fn get_blob(
        &self,
        vault_id: &[u8],
        hash: &[u8],
    ) -> Result<Option<Vec<u8>>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.blobs.get(&pair(vault_id, hash)).map(|(b, _)| b.clone()))
    }

    pub(in crate::storage::memory) fn blob_hashes(&self, vault_id: &[u8]) -> Result<Vec<Vec<u8>>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.blobs
            .keys()
            .filter(|(v, _)| v == vault_id)
            .map(|(_, h)| h.clone())
            .collect())
    }

    pub(in crate::storage::memory) fn vault_usage(&self, vault_id: &[u8]) -> Result<u64> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok((d
            .blobs
            .iter()
            .filter(|((v, _), _)| v == vault_id)
            .map(|(_, (b, _))| b.len())
            .sum::<usize>()
            + d.lists
                .iter()
                .filter(|((v, _), _)| v == vault_id)
                .map(|(_, (f, _, _))| f.bytes.len())
                .sum::<usize>()
            + d.states
                .iter()
                .filter(|((v, k, _), _)| v == vault_id && *k == TStateKind::Keyring)
                .map(|(_, b)| b.len())
                .sum::<usize>()) as u64)
    }

    pub(in crate::storage::memory) fn prune(
        &self,
        vault_id: &[u8],
        policy: &IHistoryPolicy,
        now: u64,
    ) -> Result<IPruneResult> {
        self.prune_inner(vault_id, policy, now)
    }
}
