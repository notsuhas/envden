use super::super::data::*;
use envden_core::errors::Result;
impl IMemory {
    pub(in crate::storage::memory) fn remember_nonce(
        &self,
        device: &[u8],
        nonce: &[u8],
        now: u64,
    ) -> Result<bool> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        let key = pair(device, nonce);
        if d.nonces.get(&key).is_some_and(|e| *e > now) {
            return Ok(false);
        }
        d.nonces.insert(key, now + 600000);
        Ok(true)
    }
}
