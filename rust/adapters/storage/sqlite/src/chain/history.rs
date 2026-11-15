use crate::{adapter::SqliteStorageAdapter, db::invalid};
use envden_core::{adapters::*, errors::Result};
use rusqlite::params;
use std::sync::atomic::Ordering;

const RANKED: &str = "WITH ranked AS (SELECT file,version FROM (SELECT DISTINCT file,version,DENSE_RANK() OVER (PARTITION BY file ORDER BY version DESC) AS rank FROM versions WHERE vault=?1) WHERE rank<=?3)";
impl SqliteStorageAdapter {
    pub(crate) fn prune(
        &self,
        vault: &[u8],
        policy: &IHistoryPolicy,
        now: u64,
    ) -> Result<IPruneResult> {
        if policy.min_versions < 1 {
            return Err(invalid("Invalid history policy"));
        }
        if self.depth.load(Ordering::Relaxed) > 0 {
            return Err(invalid(
                "Pruning must run outside an application transaction",
            ));
        }
        self.maintain(now)?;
        let result = self.atomic(|| {
            let mut candidates = self.rows("SELECT DISTINCT blob FROM versions WHERE vault=? AND blob IS NOT NULL", [vault], |r| r.get::<_, Vec<u8>>(0))?;
            candidates.extend(self.rows("SELECT hash FROM blob_usage WHERE vault=? AND at<? AND hash NOT IN (SELECT blob FROM versions WHERE vault=blob_usage.vault AND blob IS NOT NULL)", params![vault, now as f64 - 86400000.0], |r| r.get::<_, Vec<u8>>(0))?);
            let cutoff = now as f64 - policy.max_age as f64;
            let removed = self.rows(&format!("{RANKED} DELETE FROM lists WHERE vault=?1 AND at<?2 AND permanent=0 AND hash NOT IN (SELECT files FROM headers WHERE vault=?1 ORDER BY seq DESC LIMIT 1) AND hash NOT IN (SELECT MIN(list) FROM versions WHERE vault=?1 AND (file,version) IN ranked GROUP BY file,version) RETURNING hash"), params![vault, cutoff, policy.min_versions as i64], |r| r.get::<_, Vec<u8>>(0))?;
            let retained = self.rows(&format!("{RANKED} SELECT DISTINCT v.blob FROM versions v JOIN lists l ON l.vault=v.vault AND l.hash=v.list WHERE v.vault=?1 AND v.blob IS NOT NULL AND (l.at>=?2 OR (v.file,v.version) IN ranked)"), params![vault, cutoff, policy.min_versions as i64], |r| r.get::<_, Vec<u8>>(0))?;
            let mut blobs = 0;
            for hash in candidates { if retained.contains(&hash) { continue; } self.run("DELETE FROM blob_usage WHERE vault=? AND hash=?", params![vault, hash])?; self.run("INSERT OR IGNORE INTO blob_garbage VALUES(?,?)", params![vault, hash])?; blobs += self.run("DELETE FROM blobs WHERE vault=? AND hash=?", params![vault, hash])?; }
            Ok(IPruneResult { lists: removed.len(), blobs })
        })?;
        self.collect_garbage()?;
        Ok(result)
    }
}
