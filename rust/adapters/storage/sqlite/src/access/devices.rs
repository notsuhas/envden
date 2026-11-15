use crate::adapter::SqliteStorageAdapter;
use envden_core::{adapters::*, errors::Result};
use rusqlite::params;

impl SqliteStorageAdapter {
    pub(crate) fn device(&self, vault: &[u8], device: &[u8]) -> Result<Option<IStoredDevice>> {
        self.one(
            "SELECT unlocked,fresh,version,grant FROM devices WHERE vault=? AND id=?",
            params![vault, device],
            |r| {
                Ok(IStoredDevice {
                    unlocked_until: r.get::<_, f64>(0)? as u64,
                    fresh_until: r.get::<_, f64>(1)? as u64,
                    client_version: r.get(2)?,
                    mailbox_grant: r.get(3)?,
                })
            },
        )
    }
    pub(crate) fn put_device(
        &self,
        vault: &[u8],
        device: &[u8],
        state: &IStoredDevice,
    ) -> Result<()> {
        self.run(
            "INSERT OR REPLACE INTO devices VALUES(?,?,?,?,?,?)",
            params![
                vault,
                device,
                state.unlocked_until as f64,
                state.fresh_until as f64,
                state.client_version,
                state.mailbox_grant
            ],
        )?;
        Ok(())
    }
    pub(crate) fn approver(
        &self,
        vault: &[u8],
        device: &[u8],
        now: u64,
    ) -> Result<Option<Vec<u8>>> {
        self.bytes(
            "SELECT bytes FROM approvers WHERE vault=? AND device=? AND expires>?",
            params![vault, device, now as f64],
        )
    }
}
