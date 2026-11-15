use crate::adapter::SqliteStorageAdapter;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use rusqlite::params;

impl SqliteStorageAdapter {
    pub(crate) fn vault_usage(&self, vault: &[u8]) -> Result<u64> {
        Ok(self.one("SELECT (SELECT COALESCE(SUM(size),0) FROM blob_usage WHERE vault=?) + (SELECT COALESCE(SUM(length(bytes)),0) FROM lists WHERE vault=?) + (SELECT COALESCE(SUM(length(bytes)),0) FROM state WHERE vault=? AND kind='keyring') + (SELECT COALESCE(SUM(length(list)+length(file)+length(version)+COALESCE(length(blob),0)+1),0) FROM versions WHERE vault=?)", params![vault, vault, vault, vault], |r| r.get::<_, i64>(0).map(|v| v as u64))?.unwrap_or(0))
    }
    pub(crate) fn check_growth(
        &self,
        vault: &[u8],
        before: u64,
        after: u64,
        limit: u64,
    ) -> Result<()> {
        let imported = self
            .one(
                "SELECT active,repair FROM vaults WHERE id=?",
                [vault],
                |r| Ok((r.get::<_, bool>(0)?, r.get::<_, Option<Vec<u8>>>(1)?)),
            )?
            .is_some_and(|(active, repair)| !active || repair.is_some());
        if !imported && after > limit && after > before {
            return Err(EnvdenError::new(
                ErrorCode::StorageQuota,
                "Vault storage quota exceeded",
            ));
        }
        Ok(())
    }
}
