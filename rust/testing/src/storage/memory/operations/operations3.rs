use super::super::data::*;
use envden_core::{adapters::*, errors::Result};
impl IMemory {
    pub(in crate::storage::memory) fn put_session(
        &self,
        vault_id: &[u8],
        key: &ISessionKey,
        bytes: &[u8],
        now: u64,
    ) -> Result<()> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        d.sessions.insert(
            (vault_id.to_vec(), key.clone()),
            (
                bytes.to_vec(),
                now + if key.kind == TSessionKind::Login {
                    120000
                } else {
                    600000
                },
            ),
        );
        Ok(())
    }
    pub(in crate::storage::memory) fn session(
        &self,
        vault_id: &[u8],
        key: &ISessionKey,
        now: u64,
    ) -> Result<Option<Vec<u8>>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.sessions
            .get(&(vault_id.to_vec(), key.clone()))
            .filter(|(_, expires)| *expires > now)
            .map(|(b, _)| b.clone()))
    }
    pub(in crate::storage::memory) fn consume_session(
        &self,
        vault_id: &[u8],
        key: &ISessionKey,
        now: u64,
    ) -> Result<Option<Vec<u8>>> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        Ok(d.sessions
            .shift_remove(&(vault_id.to_vec(), key.clone()))
            .filter(|(_, expires)| *expires > now)
            .map(|(b, _)| b))
    }
    pub(in crate::storage::memory) fn charge(
        &self,
        vault_id: &[u8],
        bucket: &TRateBucket,
        now: u64,
    ) -> Result<TRateCharge> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        let key = match bucket {
            TRateBucket::NonMember => format!("vault:{vault_id:?}"),
            TRateBucket::Member { device } => format!("member:{device:?}"),
            TRateBucket::Mailbox {
                device: Some(device),
            } => format!("mailbox-writer:{device:?}"),
            TRateBucket::Mailbox { device: None } => format!("mailbox:{vault_id:?}"),
        };
        let prior = d.buckets.get(&key).copied();
        if let Some((until, _)) = prior
            && now < until
        {
            return Ok(TRateCharge::Locked { until });
        }
        d.charges
            .retain(|_, (k, at)| *k != key || (*at as i128) > now as i128 - 900000);
        d.receipt += 1;
        let receipt = d.receipt.to_string();
        d.charges.insert(receipt.clone(), (key.clone(), now));
        if d.charges.values().filter(|(k, _)| *k == key).count()
            >= if matches!(bucket, TRateBucket::Mailbox { .. }) {
                20
            } else {
                5
            }
        {
            let strikes = prior.map(|(_, s)| s).unwrap_or(0) + 1;
            d.buckets.insert(
                key,
                (
                    now + (900000u64 * 2u64.pow((strikes - 1).min(7))).min(86400000),
                    strikes,
                ),
            );
        }
        Ok(TRateCharge::Charged { receipt })
    }
    pub(in crate::storage::memory) fn refund(&self, receipt: &str, now: u64) -> Result<bool> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        let Some((key, at)) = d.charges.get(receipt).cloned() else {
            return Ok(false);
        };
        if at as i128 <= now as i128 - 900000 {
            return Ok(false);
        }
        d.charges.shift_remove(receipt);
        if let Some((until, _)) = d.buckets.get_mut(&key) {
            *until = 0;
        }
        Ok(true)
    }
}
