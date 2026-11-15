use super::super::data::*;
use envden_core::{adapters::*, errors::Result};
impl IMemory {
    pub(in crate::storage::memory) fn open_mailbox(
        &self,
        vault_id: &[u8],
        device: &[u8],
        now: u64,
    ) -> Result<Option<IStoredMailbox>> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        d.mailboxes.retain(|_, (_, b)| b.expires_at > now);
        let openings = d.openings.entry(vault_id.to_vec()).or_default();
        openings.retain(|at| *at as i128 > now as i128 - 3600000);
        if openings.len() >= 10 {
            return Ok(None);
        }
        let Some(number) = (1..=999).find(|n| !d.mailboxes.contains_key(n)) else {
            return Ok(None);
        };
        let mailbox = IStoredMailbox {
            number,
            device: device.to_vec(),
            expires_at: now + 600000,
            slots: Default::default(),
        };
        d.mailboxes
            .insert(number, (vault_id.to_vec(), mailbox.clone()));
        d.openings.get_mut(vault_id).unwrap().push(now);
        Ok(Some(mailbox))
    }
    pub(in crate::storage::memory) fn mailbox(
        &self,
        vault_id: &[u8],
        number: u64,
        now: u64,
    ) -> Result<Option<IStoredMailbox>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.mailboxes
            .get(&number)
            .filter(|(v, b)| v == vault_id && b.expires_at > now)
            .map(|(_, b)| b.clone()))
    }
    pub(in crate::storage::memory) fn write_mailbox(
        &self,
        vault_id: &[u8],
        number: u64,
        slot: TMailboxSlot,
        bytes: &[u8],
        now: u64,
    ) -> Result<TMailboxWrite> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        let Some((v, b)) = d.mailboxes.get(&number) else {
            return Ok(TMailboxWrite::Closed);
        };
        if v != vault_id || b.expires_at <= now {
            return Ok(TMailboxWrite::Closed);
        }
        if b.slots.get(&slot).is_some_and(|b| b == bytes) {
            return Ok(TMailboxWrite::Identical);
        }
        if b.slots.contains_key(&slot) || bytes.len() > 4096 {
            d.mailboxes.shift_remove(&number);
            return Ok(TMailboxWrite::Closed);
        }
        let predecessor = match slot {
            TMailboxSlot::KE1 => None,
            TMailboxSlot::KE2 => Some(TMailboxSlot::KE1),
            TMailboxSlot::KE3 => Some(TMailboxSlot::KE2),
            TMailboxSlot::PairJoiner => Some(TMailboxSlot::KE3),
        };
        if predecessor.is_some_and(|p| !b.slots.contains_key(&p)) {
            return Ok(TMailboxWrite::OutOfOrder);
        }
        d.mailboxes
            .get_mut(&number)
            .unwrap()
            .1
            .slots
            .insert(slot, bytes.to_vec());
        Ok(TMailboxWrite::Written)
    }
    pub(in crate::storage::memory) fn close_mailbox(
        &self,
        vault_id: &[u8],
        number: u64,
    ) -> Result<()> {
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        if d.mailboxes.get(&number).is_some_and(|(v, _)| v == vault_id) {
            d.mailboxes.shift_remove(&number);
        }
        Ok(())
    }
    pub(in crate::storage::memory) fn approver(
        &self,
        vault_id: &[u8],
        device: &[u8],
        now: u64,
    ) -> Result<Option<Vec<u8>>> {
        let guard = self.data.lock();
        let d = guard.borrow_mut();
        Ok(d.approvers
            .get(&pair(vault_id, device))
            .filter(|(_, e)| *e > now)
            .map(|(b, _)| b.clone()))
    }
}
