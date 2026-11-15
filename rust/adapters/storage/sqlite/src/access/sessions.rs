use crate::{adapter::SqliteStorageAdapter, db::session_kind};
use envden_core::{adapters::*, errors::Result};
use rusqlite::params;

impl SqliteStorageAdapter {
    pub(crate) fn put_session(
        &self,
        vault: &[u8],
        key: &ISessionKey,
        bytes: &[u8],
        now: u64,
    ) -> Result<()> {
        self.maintain(now)?;
        let expires = now as f64
            + if key.kind == TSessionKind::Login {
                120000.0
            } else {
                600000.0
            };
        self.run(
            "INSERT OR REPLACE INTO sessions VALUES(?,?,?,?,?,?)",
            params![
                vault,
                session_kind(key.kind),
                key.device,
                key.purpose,
                bytes,
                expires
            ],
        )?;
        Ok(())
    }
    pub(crate) fn session(
        &self,
        vault: &[u8],
        key: &ISessionKey,
        now: u64,
    ) -> Result<Option<Vec<u8>>> {
        self.bytes("SELECT bytes FROM sessions WHERE vault=? AND kind=? AND device=? AND purpose=? AND expires>?", params![vault, session_kind(key.kind), key.device, key.purpose, now as f64])
    }
    pub(crate) fn consume_session(
        &self,
        vault: &[u8],
        key: &ISessionKey,
        now: u64,
    ) -> Result<Option<Vec<u8>>> {
        self.bytes("DELETE FROM sessions WHERE vault=? AND kind=? AND device=? AND purpose=? AND expires>? RETURNING bytes", params![vault, session_kind(key.kind), key.device, key.purpose, now as f64])
    }
    pub(crate) fn remember_nonce(&self, device: &[u8], nonce: &[u8], now: u64) -> Result<bool> {
        self.maintain(now)?;
        self.atomic(|| {
            self.run(
                "DELETE FROM nonces WHERE device=? AND nonce=? AND expires<=?",
                params![device, nonce, now as f64],
            )?;
            Ok(self.run(
                "INSERT OR IGNORE INTO nonces VALUES(?,?,?)",
                params![device, nonce, now as f64 + 600000.0],
            )? == 1)
        })
    }
}
