use crate::{adapter::SqliteStorageAdapter, db::seq};
use envden_core::{adapters::*, errors::Result};
use rusqlite::params;

impl SqliteStorageAdapter {
    pub(crate) fn find_committed(&self, vault: &[u8], digest: &[u8]) -> Result<bool> {
        Ok(self
            .bytes(
                "SELECT digest FROM digests WHERE vault=? AND digest=?",
                params![vault, digest],
            )?
            .is_some())
    }
    pub(crate) fn commit_swap(
        &self,
        vault: &[u8],
        expected: Option<&[u8]>,
        swap: &IStoredSwap,
        now: u64,
    ) -> Result<TCommitResult> {
        self.atomic(|| {
            if self.find_committed(vault, &swap.body_digest)? {
                return Ok(TCommitResult::RetryOfCommitted);
            }
            let head = self.head(vault)?;
            if head.as_deref() != expected {
                return Ok(TCommitResult::HeadMoved { head });
            }
            let before = self.vault_usage(vault)?;
            prepare_commit(self, vault, swap, now)?;
            let prior = self.bytes(
                "SELECT files FROM headers WHERE vault=? ORDER BY seq DESC LIMIT 1",
                [vault],
            )?;
            let prior_size = if let Some(hash) = &prior {
                self.one(
                    "SELECT length(bytes) FROM lists WHERE vault=? AND hash=?",
                    params![vault, hash],
                    |r| r.get::<_, i64>(0).map(|v| v as usize),
                )?
            } else {
                None
            };
            let prior_blobs = if let Some(hash) = &prior {
                self.rows(
                    "SELECT blob FROM versions WHERE vault=? AND list=? AND blob IS NOT NULL",
                    params![vault, hash],
                    |r| r.get::<_, Vec<u8>>(0),
                )?
            } else {
                vec![]
            };
            if let Some(files) = &swap.files {
                self.put_file_list(vault, files, now)?;
                if files.retain_forever == Some(true)
                    && let Some(prior) = &prior
                {
                    self.run(
                        "UPDATE lists SET permanent=1 WHERE vault=? AND hash=?",
                        params![vault, prior],
                    )?;
                }
            }
            let current = swap
                .files_hash
                .as_ref()
                .or_else(|| swap.files.as_ref().map(|f| &f.hash))
                .or(prior.as_ref());
            if let Some(hash) = current {
                self.run(
                    "UPDATE lists SET at=? WHERE vault=? AND hash=?",
                    params![now as f64, vault, hash],
                )?;
            }
            self.run(
                "INSERT INTO headers VALUES(?,?,?,?,?,?)",
                params![
                    vault,
                    seq(swap.header.seq),
                    swap.header.hash,
                    swap.header.bytes,
                    now as f64,
                    current
                ],
            )?;
            for entry in &swap.entries {
                self.run(
                    "INSERT INTO entries VALUES(?,?,?,?)",
                    params![vault, seq(entry.seq), entry.hash, entry.bytes],
                )?;
            }
            let adds = swap.files.as_ref().is_none_or(|f| {
                prior_size.is_none_or(|s| f.bytes.len() > s)
                    || f.versions.iter().any(|v| {
                        v.blob_hash
                            .as_ref()
                            .is_some_and(|h| !prior_blobs.contains(h))
                    })
            });
            if adds {
                self.check_growth(vault, before, self.vault_usage(vault)?, VAULT_QUOTA_BYTES)?;
            }
            write_commit_state(self, vault, swap)?;
            if let Some(a) = &swap.approver {
                self.run(
                    "INSERT OR REPLACE INTO approvers VALUES(?,?,?,?)",
                    params![vault, a.device, a.bytes, now as f64 + 86400000.0],
                )?;
            }
            if swap.clear_repair_reports == Some(true) {
                self.run(
                    "DELETE FROM state WHERE vault=? AND kind='repair-report'",
                    [vault],
                )?;
            }
            if let Some(number) = swap.close_mailbox {
                self.close_mailbox(vault, number)?;
            }
            if swap.setup_token_hash.is_some() {
                self.run("DELETE FROM setup", [])?;
            }
            self.run(
                "INSERT INTO digests VALUES(?,?)",
                params![vault, swap.body_digest],
            )?;
            self.run(
                "UPDATE vaults SET head=? WHERE id=?",
                params![swap.header.hash, vault],
            )?;
            Ok(TCommitResult::Committed)
        })
    }
}
