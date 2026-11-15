use super::super::data::*;
use envden_core::{adapters::*, errors::Result};
impl IMemory {
    pub(in crate::storage::memory) fn close(&self) -> Result<()> {
        Ok(())
    }
    pub(in crate::storage::memory) fn transaction(
        &self,
        run: &mut dyn FnMut() -> Result<()>,
    ) -> Result<()> {
        let guard = self.data.lock();
        let snapshot = guard.borrow().clone();
        guard.borrow_mut().depth += 1;
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(run));
        match result {
            Ok(Ok(())) => {
                guard.borrow_mut().depth -= 1;
                Ok(())
            }
            Ok(Err(e)) => {
                *guard.borrow_mut() = snapshot;
                Err(e)
            }
            Err(p) => {
                *guard.borrow_mut() = snapshot;
                std::panic::resume_unwind(p)
            }
        }
    }
    pub(in crate::storage::memory) fn vault_ids(&self) -> Result<Vec<Vec<u8>>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.vaults.keys().cloned().collect())
    }
    pub(in crate::storage::memory) fn cap_unlocks(
        &self,
        vault_id: &[u8],
        until: u64,
    ) -> Result<()> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        for ((v, _), state) in &mut d.devices {
            if v == vault_id {
                state.unlocked_until = state.unlocked_until.min(until);
            }
        }
        Ok(())
    }
    pub(in crate::storage::memory) fn has_vault(&self, vault_id: &[u8]) -> Result<bool> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.vaults.contains_key(vault_id))
    }
    pub(in crate::storage::memory) fn vault(
        &self,
        vault_id: &[u8],
    ) -> Result<Option<IStoredVault>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.vaults.get(vault_id).cloned())
    }
    pub(in crate::storage::memory) fn configure_vault(
        &self,
        vault_id: &[u8],
        state: &IStoredVault,
        writes: &[IStateWrite],
        setup_token_hash: Option<&[u8]>,
    ) -> Result<()> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        if let Some(hash) = setup_token_hash
            && (d.vaults.contains_key(vault_id) || d.setup.as_deref() != Some(hash))
        {
            return Err(fail("Setup token changed, consumed, or vault exists"));
        }
        d.vaults.insert(vault_id.to_vec(), state.clone());
        for write in writes {
            let key = (vault_id.to_vec(), write.kind, write.key.clone());
            if let Some(bytes) = &write.bytes {
                d.states.insert(key, bytes.clone());
            } else {
                d.states.shift_remove(&key);
            }
        }
        if setup_token_hash.is_some() {
            d.setup = None;
        }
        Ok(())
    }
    pub(in crate::storage::memory) fn discard_inactive_vault(&self, vault_id: &[u8]) -> Result<()> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        if d.vaults.get(vault_id).is_some_and(|v| v.active) {
            return Err(fail("Cannot discard an active vault"));
        }
        d.vaults.shift_remove(vault_id);
        d.heads.shift_remove(vault_id);
        d.headers.shift_remove(vault_id);
        d.entries.shift_remove(vault_id);
        d.current.shift_remove(vault_id);
        d.openings.shift_remove(vault_id);
        d.lists.retain(|(v, _), _| v != vault_id);
        d.states.retain(|(v, _, _), _| v != vault_id);
        d.devices.retain(|(v, _), _| v != vault_id);
        d.blobs.retain(|(v, _), _| v != vault_id);
        d.approvers.retain(|(v, _), _| v != vault_id);
        d.sessions.retain(|(v, _), _| v != vault_id);
        d.digests.retain(|(v, _)| v != vault_id);
        d.mailboxes.retain(|_, (v, _)| v != vault_id);
        Ok(())
    }
    pub(in crate::storage::memory) fn find_committed(
        &self,
        vault_id: &[u8],
        digest: &[u8],
    ) -> Result<bool> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.digests.contains(&pair(vault_id, digest)))
    }
    pub(in crate::storage::memory) fn has_blob(
        &self,
        vault_id: &[u8],
        hash: &[u8],
    ) -> Result<bool> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.blobs.contains_key(&pair(vault_id, hash)))
    }
}
