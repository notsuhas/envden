use crate::adapter::SqliteStorageAdapter;
use envden_core::{adapters::*, errors::Result};
use rusqlite::params;

impl SqliteStorageAdapter {
    pub(crate) fn charge(
        &self,
        vault: &[u8],
        bucket: &TRateBucket,
        now: u64,
    ) -> Result<TRateCharge> {
        let key = match bucket {
            TRateBucket::Member { device } => format!("member:{}", hex::encode(device)),
            TRateBucket::NonMember => format!("vault:{}", hex::encode(vault)),
            TRateBucket::Mailbox {
                device: Some(device),
            } => format!("mailbox-writer:{}", hex::encode(device)),
            TRateBucket::Mailbox { device: None } => format!("mailbox:{}", hex::encode(vault)),
        };
        self.atomic(|| {
            self.run("DELETE FROM charges WHERE at<=?", [now as f64 - 900000.0])?;
            self.run(
                "DELETE FROM buckets WHERE until<=?",
                [now as f64 - 86400000.0],
            )?;
            let row = self.one(
                "SELECT until,strikes FROM buckets WHERE key=?",
                [&key],
                |r| Ok((r.get::<_, f64>(0)?, r.get::<_, u32>(1)?)),
            )?;
            if let Some((until, _)) = row
                && (now as f64) < until
            {
                return Ok(TRateCharge::Locked {
                    until: until as u64,
                });
            }
            let receipt = uuid::Uuid::new_v4().to_string();
            self.run(
                "INSERT INTO charges VALUES(?,?,?)",
                params![receipt, key, now as f64],
            )?;
            let count = self
                .one("SELECT COUNT(*) FROM charges WHERE bucket=?", [&key], |r| {
                    r.get::<_, i64>(0).map(|v| v as u64)
                })?
                .unwrap_or(0);
            if count
                >= if matches!(bucket, TRateBucket::Mailbox { .. }) {
                    20
                } else {
                    5
                }
            {
                let strikes = row
                    .filter(|(until, _)| now as f64 - until < 86400000.0)
                    .map_or(0, |(_, s)| s)
                    + 1;
                let until = now as f64
                    + (900000_u64 * 2_u64.pow((strikes - 1).min(7))).min(86400000) as f64;
                self.run(
                    "INSERT OR REPLACE INTO buckets VALUES(?,?,?)",
                    params![key, until, strikes],
                )?;
            }
            Ok(TRateCharge::Charged { receipt })
        })
    }
    pub(crate) fn refund(&self, receipt: &str, now: u64) -> Result<bool> {
        self.atomic(|| {
            let row = self.one(
                "DELETE FROM charges WHERE receipt=? AND at>? RETURNING bucket",
                params![receipt, now as f64 - 900000.0],
                |r| r.get::<_, String>(0),
            )?;
            let Some(key) = row else {
                return Ok(false);
            };
            self.run("UPDATE buckets SET until=0,strikes=0 WHERE key=?", [key])?;
            Ok(true)
        })
    }
}
