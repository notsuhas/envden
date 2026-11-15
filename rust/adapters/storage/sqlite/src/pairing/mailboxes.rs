use crate::{adapter::SqliteStorageAdapter, db::slot_name};
use envden_core::{adapters::*, errors::Result};
use rusqlite::params;
use std::collections::BTreeMap;

impl SqliteStorageAdapter {
    pub(crate) fn open_mailbox(
        &self,
        vault: &[u8],
        device: &[u8],
        now: u64,
    ) -> Result<Option<IStoredMailbox>> {
        self.atomic(|| {
            self.run("DELETE FROM mailboxes WHERE expires<=?", [now as f64])?;
            self.run("DELETE FROM openings WHERE at<=?", [now as f64 - 3600000.0])?;
            if self
                .one(
                    "SELECT COUNT(*) FROM openings WHERE vault=?",
                    [vault],
                    |r| r.get::<_, i64>(0).map(|v| v as u64),
                )?
                .unwrap_or(0)
                >= 10
            {
                return Ok(None);
            }
            let used = self.rows("SELECT number FROM mailboxes", [], |r| {
                r.get::<_, i64>(0).map(|v| v as u64)
            })?;
            let Some(number) = (1..=999).find(|n| !used.contains(n)) else {
                return Ok(None);
            };
            self.run(
                "INSERT INTO mailboxes VALUES(?,?,?,?)",
                params![number as i64, vault, device, now as f64 + 600000.0],
            )?;
            self.run(
                "INSERT INTO openings VALUES(?,?)",
                params![vault, now as f64],
            )?;
            Ok(Some(IStoredMailbox {
                number,
                device: device.to_vec(),
                expires_at: now + 600000,
                slots: BTreeMap::new(),
            }))
        })
    }
    pub(crate) fn mailbox(
        &self,
        vault: &[u8],
        number: u64,
        now: u64,
    ) -> Result<Option<IStoredMailbox>> {
        let row = self.one(
            "SELECT device,expires FROM mailboxes WHERE vault=? AND number=? AND expires>?",
            params![vault, number as i64, now as f64],
            |r| Ok((r.get::<_, Vec<u8>>(0)?, r.get::<_, f64>(1)?)),
        )?;
        let Some((device, expires)) = row else {
            return Ok(None);
        };
        let mut slots = BTreeMap::new();
        for slot in [
            TMailboxSlot::KE1,
            TMailboxSlot::KE2,
            TMailboxSlot::KE3,
            TMailboxSlot::PairJoiner,
        ] {
            if let Some(bytes) = self.bytes(
                "SELECT bytes FROM slots WHERE number=? AND slot=?",
                params![number as i64, slot_name(slot)],
            )? {
                slots.insert(slot, bytes);
            }
        }
        Ok(Some(IStoredMailbox {
            number,
            device,
            expires_at: expires as u64,
            slots,
        }))
    }
    pub(crate) fn close_mailbox(&self, vault: &[u8], number: u64) -> Result<()> {
        self.run(
            "DELETE FROM mailboxes WHERE vault=? AND number=?",
            params![vault, number as i64],
        )?;
        Ok(())
    }
    pub(crate) fn write_mailbox(
        &self,
        vault: &[u8],
        number: u64,
        slot: TMailboxSlot,
        bytes: &[u8],
        now: u64,
    ) -> Result<TMailboxWrite> {
        self.atomic(|| {
            let Some(mailbox) = self.mailbox(vault, number, now)? else {
                return Ok(TMailboxWrite::Closed);
            };
            let prior = mailbox.slots.get(&slot);
            if prior.is_some_and(|p| p == bytes) {
                return Ok(TMailboxWrite::Identical);
            }
            if prior.is_some() || bytes.len() > 4096 {
                self.close_mailbox(vault, number)?;
                return Ok(TMailboxWrite::Closed);
            }
            let predecessor = match slot {
                TMailboxSlot::KE1 => None,
                TMailboxSlot::KE2 => Some(TMailboxSlot::KE1),
                TMailboxSlot::KE3 => Some(TMailboxSlot::KE2),
                TMailboxSlot::PairJoiner => Some(TMailboxSlot::KE3),
            };
            if predecessor.is_some_and(|p| !mailbox.slots.contains_key(&p)) {
                return Ok(TMailboxWrite::OutOfOrder);
            }
            self.run(
                "INSERT INTO slots VALUES(?,?,?)",
                params![number as i64, slot_name(slot), bytes],
            )?;
            Ok(TMailboxWrite::Written)
        })
    }
}
