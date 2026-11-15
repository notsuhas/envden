use crate::{adapter::SqliteStorageAdapter, db::invalid};
use envden_core::{
    adapters::*,
    errors::{EnvdenError, ErrorCode, Result},
};
use rusqlite::params;

impl SqliteStorageAdapter {
    pub(crate) fn vault_ids(&self) -> Result<Vec<Vec<u8>>> {
        self.rows("SELECT id FROM vaults ORDER BY id", [], |r| r.get(0))
    }
    pub(crate) fn has_vault(&self, vault: &[u8]) -> Result<bool> {
        Ok(self.vault(vault)?.is_some())
    }
    pub(crate) fn vault(&self, vault: &[u8]) -> Result<Option<IStoredVault>> {
        self.one("SELECT active,frozen,moved,refused,period,repair,restored,progress FROM vaults WHERE id=?", [vault], |r| {
            let repair: Option<Vec<u8>> = r.get(5)?; let restored: Option<Vec<u8>> = r.get(6)?;
            Ok(IStoredVault { active: r.get(0)?, frozen: r.get(1)?, server_moved: r.get(2)?, sk_refused: r.get(3)?, unlock_period: r.get::<_, Option<f64>>(4)?.map(|v| v as u64), restored: match (repair, restored) { (Some(repair_token_hash), Some(restored_head)) => Some(IRestoredVault { repair_token_hash, restored_head, finish_progress: r.get(7)? }), _ => None } })
        })
    }
    pub(crate) fn configure_vault(
        &self,
        vault: &[u8],
        state: &IStoredVault,
        writes: &[IStateWrite],
        token: Option<&[u8]>,
    ) -> Result<()> {
        self.atomic(|| {
            if let Some(token) = token && (self.has_vault(vault)? || self.setup_token()?.as_deref() != Some(token)) { return Err(invalid("Setup token changed, consumed, or vault exists")); }
            if vault.len() == 32 && vault.iter().all(|b| *b == 0) { return Err(EnvdenError::new(ErrorCode::InvalidInput, "Invalid vault ID")); }
            let restored = state.restored.as_ref();
            self.run("INSERT INTO vaults(id,active,frozen,moved,refused,period,repair,restored,progress) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active,frozen=excluded.frozen,moved=excluded.moved,refused=excluded.refused,period=excluded.period,repair=excluded.repair,restored=excluded.restored,progress=excluded.progress", params![vault, state.active, state.frozen, state.server_moved, state.sk_refused, state.unlock_period.map(|v| v as f64), restored.map(|r| &r.repair_token_hash), restored.map(|r| &r.restored_head), restored.and_then(|r| r.finish_progress.as_ref())])?;
            self.write_state(vault, writes)?;
            if token.is_some() { self.run("DELETE FROM setup", [])?; }
            Ok(())
        })
    }
    pub(crate) fn head(&self, vault: &[u8]) -> Result<Option<Vec<u8>>> {
        self.bytes(
            "SELECT head FROM vaults WHERE id=? AND head IS NOT NULL",
            [vault],
        )
    }
    pub(crate) fn cap_unlocks(&self, vault: &[u8], until: u64) -> Result<()> {
        self.run(
            "UPDATE devices SET unlocked=MIN(unlocked,?) WHERE vault=?",
            params![until as f64, vault],
        )?;
        Ok(())
    }
    pub(crate) fn discard_inactive_vault(&self, vault: &[u8]) -> Result<()> {
        self.atomic(|| {
            if self.vault(vault)?.is_some_and(|v| v.active) {
                return Err(invalid("Cannot discard an active vault"));
            }
            self.run(
                "INSERT OR IGNORE INTO blob_garbage SELECT vault,hash FROM blobs WHERE vault=?",
                [vault],
            )?;
            for table in [
                "headers",
                "entries",
                "lists",
                "state",
                "devices",
                "digests",
                "blobs",
                "blob_usage",
                "sessions",
                "approvers",
                "mailboxes",
                "openings",
            ] {
                self.run(&format!("DELETE FROM {table} WHERE vault=?"), [vault])?;
            }
            self.run("DELETE FROM vaults WHERE id=?", [vault])?;
            Ok(())
        })?;
        self.collect_garbage()
    }
}
