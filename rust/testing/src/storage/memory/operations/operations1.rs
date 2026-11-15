use super::super::data::*;
use envden_core::{adapters::*, errors::Result};
impl IMemory {
    pub(in crate::storage::memory) fn head(&self, vault_id: &[u8]) -> Result<Option<Vec<u8>>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.heads.get(vault_id).cloned())
    }
    pub(in crate::storage::memory) fn commit_swap(
        &self,
        vault_id: &[u8],
        expected_head: Option<&[u8]>,
        swap: &IStoredSwap,
        now: u64,
    ) -> Result<TCommitResult> {
        let guard = self.data.lock();
        let snapshot = guard.borrow().clone();
        let result = self.commit_inner(vault_id, expected_head, swap, now);
        if result.is_err() {
            *guard.borrow_mut() = snapshot;
        }
        result
    }
    pub(in crate::storage::memory) fn headers(
        &self,
        vault_id: &[u8],
        from_seq: u64,
        to_seq: u64,
        limit: Option<usize>,
        max_bytes: Option<usize>,
    ) -> Result<Vec<IStoredHeader>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(range(
            d.headers.get(vault_id),
            from_seq,
            to_seq,
            limit,
            max_bytes,
        ))
    }
    pub(in crate::storage::memory) fn headers_for_files(
        &self,
        vault_id: &[u8],
        hash: &[u8],
    ) -> Result<Vec<IStoredHeader>> {
        let _ = (vault_id, hash);
        Err(fail("Unexpected fake operation: storage.headersForFiles"))
    }
    pub(in crate::storage::memory) fn header(
        &self,
        vault_id: &[u8],
        hash: &[u8],
    ) -> Result<Option<IStoredHeader>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.headers
            .get(vault_id)
            .into_iter()
            .flatten()
            .find(|r| r.hash == hash)
            .cloned())
    }
    pub(in crate::storage::memory) fn entries(
        &self,
        vault_id: &[u8],
        from_seq: u64,
        to_seq: u64,
        limit: Option<usize>,
        max_bytes: Option<usize>,
    ) -> Result<Vec<IStoredHeader>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(range(
            d.entries.get(vault_id),
            from_seq,
            to_seq,
            limit,
            max_bytes,
        ))
    }
    pub(in crate::storage::memory) fn put_file_list(
        &self,
        vault_id: &[u8],
        files: &IStoredFiles,
        now: u64,
    ) -> Result<()> {
        let _ = (vault_id, files, now);
        Err(fail("Unexpected fake operation: storage.putFileList"))
    }
    pub(in crate::storage::memory) fn file_list(
        &self,
        vault_id: &[u8],
        hash: &[u8],
    ) -> Result<Option<Vec<u8>>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.lists
            .get(&pair(vault_id, hash))
            .map(|(f, _, _)| f.bytes.clone()))
    }
    pub(in crate::storage::memory) fn state(
        &self,
        vault_id: &[u8],
        kind: TStateKind,
        key: &[u8],
    ) -> Result<Option<Vec<u8>>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.states
            .get(&(vault_id.to_vec(), kind, key.to_vec()))
            .cloned())
    }
    pub(in crate::storage::memory) fn states(
        &self,
        vault_id: &[u8],
        kind: TStateKind,
    ) -> Result<Vec<IStateEntry>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.states
            .iter()
            .filter(|((v, k, _), _)| v == vault_id && *k == kind)
            .map(|((_, _, key), bytes)| IStateEntry {
                key: key.clone(),
                bytes: bytes.clone(),
            })
            .collect())
    }
}
