use super::super::data::*;
use envden_core::{adapters::*, errors::Result};

impl IMemory {
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

    pub(in crate::storage::memory) fn write_state(
        &self,
        vault_id: &[u8],
        writes: &[IStateWrite],
    ) -> Result<()> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        for write in writes {
            let key = (vault_id.to_vec(), write.kind, write.key.clone());
            if let Some(bytes) = &write.bytes {
                d.states.insert(key, bytes.clone());
            } else {
                d.states.shift_remove(&key);
            }
        }
        Ok(())
    }

    pub(in crate::storage::memory) fn device(
        &self,
        vault_id: &[u8],
        device: &[u8],
    ) -> Result<Option<IStoredDevice>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.devices.get(&pair(vault_id, device)).cloned())
    }

    pub(in crate::storage::memory) fn put_device(
        &self,
        vault_id: &[u8],
        device: &[u8],
        state: &IStoredDevice,
    ) -> Result<()> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        d.devices.insert(pair(vault_id, device), state.clone());
        Ok(())
    }

    pub(in crate::storage::memory) fn setup_token(&self) -> Result<Option<Vec<u8>>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.setup.clone())
    }

    pub(in crate::storage::memory) fn set_setup_token(&self, hash: &[u8]) -> Result<()> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        d.setup = Some(hash.to_vec());
        Ok(())
    }
}
