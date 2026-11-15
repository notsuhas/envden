use crate::{adapter::SqliteStorageAdapter, db::seq};
use envden_core::{adapters::*, errors::Result};
use rusqlite::{Row, params};

pub(super) fn header_row(r: &Row<'_>) -> rusqlite::Result<IStoredHeader> {
    Ok(IStoredHeader {
        hash: r.get(0)?,
        bytes: r.get(1)?,
        seq: r.get::<_, String>(2)?.parse().map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(e))
        })?,
    })
}
impl SqliteStorageAdapter {
    fn chain(
        &self,
        table: &str,
        vault: &[u8],
        from: u64,
        to: u64,
        limit: Option<usize>,
        max_bytes: Option<usize>,
    ) -> Result<Vec<IStoredHeader>> {
        self.rows(&format!("SELECT hash,bytes,seq FROM (SELECT hash,bytes,seq,SUM(length(bytes)) OVER (ORDER BY seq) AS total,ROW_NUMBER() OVER (ORDER BY seq) AS position FROM (SELECT hash,bytes,seq FROM {table} WHERE vault=? AND seq BETWEEN ? AND ? ORDER BY seq LIMIT ?)) WHERE total<=? OR position=1 ORDER BY seq"), params![vault, seq(from), seq(to), limit.unwrap_or(2147483647) as i64, max_bytes.unwrap_or(9007199254740991) as i64], header_row)
    }
    pub(crate) fn headers(
        &self,
        vault: &[u8],
        from: u64,
        to: u64,
        limit: Option<usize>,
        max_bytes: Option<usize>,
    ) -> Result<Vec<IStoredHeader>> {
        self.chain("headers", vault, from, to, limit, max_bytes)
    }
    pub(crate) fn entries(
        &self,
        vault: &[u8],
        from: u64,
        to: u64,
        limit: Option<usize>,
        max_bytes: Option<usize>,
    ) -> Result<Vec<IStoredHeader>> {
        self.chain("entries", vault, from, to, limit, max_bytes)
    }
    pub(crate) fn header(&self, vault: &[u8], hash: &[u8]) -> Result<Option<IStoredHeader>> {
        self.one(
            "SELECT hash,bytes,seq FROM headers WHERE vault=? AND hash=?",
            params![vault, hash],
            header_row,
        )
    }
    pub(crate) fn headers_for_files(
        &self,
        vault: &[u8],
        hash: &[u8],
    ) -> Result<Vec<IStoredHeader>> {
        self.rows("SELECT hash,bytes,seq FROM headers WHERE vault=? AND files=? UNION SELECT n.hash,n.bytes,n.seq FROM headers p JOIN headers n ON n.vault=p.vault AND n.seq=(SELECT MIN(seq) FROM headers WHERE vault=p.vault AND seq>p.seq) WHERE p.vault=? AND p.files=? ORDER BY seq", params![vault, hash, vault, hash], header_row)
    }
    pub(crate) fn file_list(&self, vault: &[u8], hash: &[u8]) -> Result<Option<Vec<u8>>> {
        self.bytes(
            "SELECT bytes FROM lists WHERE vault=? AND hash=?",
            params![vault, hash],
        )
    }
    pub(crate) fn put_file_list(&self, vault: &[u8], files: &IStoredFiles, now: u64) -> Result<()> {
        self.atomic(|| {
            self.run("INSERT INTO lists VALUES(?,?,?,?,?) ON CONFLICT(vault,hash) DO UPDATE SET at=excluded.at,permanent=MAX(permanent,excluded.permanent)", params![vault, files.hash, files.bytes, now as f64, files.retain_forever.unwrap_or(false)])?;
            for version in &files.versions { self.run("INSERT OR IGNORE INTO versions VALUES(?,?,?,?,?,?)", params![vault, files.hash, version.file_id, seq(version.version), version.blob_hash, version.tombstone])?; }
            Ok(())
        })
    }
}
