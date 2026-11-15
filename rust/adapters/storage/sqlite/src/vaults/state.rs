use crate::{adapter::SqliteStorageAdapter, db::kind};
use envden_core::{adapters::*, errors::Result};
use rusqlite::params;

impl SqliteStorageAdapter {
    pub(crate) fn state(
        &self,
        vault: &[u8],
        category: TStateKind,
        key: &[u8],
    ) -> Result<Option<Vec<u8>>> {
        self.bytes(
            "SELECT bytes FROM state WHERE vault=? AND kind=? AND key=?",
            params![vault, kind(category), key],
        )
    }
    pub(crate) fn states(&self, vault: &[u8], category: TStateKind) -> Result<Vec<IStateEntry>> {
        self.rows(
            "SELECT key,bytes FROM state WHERE vault=? AND kind=? ORDER BY key",
            params![vault, kind(category)],
            |r| {
                Ok(IStateEntry {
                    key: r.get(0)?,
                    bytes: r.get(1)?,
                })
            },
        )
    }
    pub(crate) fn write_state(&self, vault: &[u8], writes: &[IStateWrite]) -> Result<()> {
        self.atomic(|| {
            for write in writes {
                if let Some(bytes) = &write.bytes {
                    self.run(
                        "INSERT OR REPLACE INTO state VALUES(?,?,?,?)",
                        params![vault, kind(write.kind), write.key, bytes],
                    )?;
                } else {
                    self.run(
                        "DELETE FROM state WHERE vault=? AND kind=? AND key=?",
                        params![vault, kind(write.kind), write.key],
                    )?;
                }
            }
            Ok(())
        })
    }
    pub(crate) fn setup_token(&self) -> Result<Option<Vec<u8>>> {
        self.bytes("SELECT bytes FROM setup WHERE singleton=1", [])
    }
    pub(crate) fn set_setup_token(&self, hash: &[u8]) -> Result<()> {
        self.run("INSERT OR REPLACE INTO setup VALUES(1,?)", [hash])?;
        Ok(())
    }
}
