use crate::{
    adapter::SqliteStorageAdapter,
    db::{fail, invalid},
};
use envden_core::errors::Result;
use rusqlite::{Connection, OptionalExtension, Params, Row};
use std::sync::atomic::Ordering;

impl SqliteStorageAdapter {
    pub(crate) fn db<T>(&self, run: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T> {
        let db = self.connection.lock();
        run(db.as_ref().ok_or_else(|| invalid("Database is closed"))?).map_err(fail)
    }
    pub(crate) fn run(&self, sql: &str, params: impl Params) -> Result<usize> {
        self.db(|db| db.execute(sql, params))
    }
    pub(crate) fn batch(&self, sql: &str) -> Result<()> {
        self.db(|db| db.execute_batch(sql))
    }
    pub(crate) fn rows<T>(
        &self,
        sql: &str,
        params: impl Params,
        read: impl FnMut(&Row<'_>) -> rusqlite::Result<T>,
    ) -> Result<Vec<T>> {
        self.db(|db| db.prepare(sql)?.query_map(params, read)?.collect())
    }
    pub(crate) fn one<T>(
        &self,
        sql: &str,
        params: impl Params,
        read: impl FnOnce(&Row<'_>) -> rusqlite::Result<T>,
    ) -> Result<Option<T>> {
        self.db(|db| db.query_row(sql, params, read).optional())
    }
    pub(crate) fn bytes(&self, sql: &str, params: impl Params) -> Result<Option<Vec<u8>>> {
        Ok(self
            .one(sql, params, |r| r.get::<_, Option<Vec<u8>>>(0))?
            .flatten())
    }
    pub(crate) fn atomic<T>(&self, run: impl FnOnce() -> Result<T>) -> Result<T> {
        let depth = self.depth.load(Ordering::Relaxed);
        let label = format!("envden_{depth}");
        self.batch(&if depth == 0 {
            "BEGIN IMMEDIATE".into()
        } else {
            format!("SAVEPOINT {label}")
        })?;
        self.depth.store(depth + 1, Ordering::Relaxed);
        let result = run();
        self.depth.store(depth, Ordering::Relaxed);
        match result {
            Ok(value) => {
                self.batch(&if depth == 0 {
                    "COMMIT".into()
                } else {
                    format!("RELEASE {label}")
                })?;
                Ok(value)
            }
            Err(error) => {
                let _ = self.batch(&if depth == 0 {
                    "ROLLBACK".into()
                } else {
                    format!("ROLLBACK TO {label}; RELEASE {label}")
                });
                Err(error)
            }
        }
    }
    pub(crate) fn maintain(&self, now: u64) -> Result<()> {
        let now = now as i64;
        if now - self.maintained.load(Ordering::Relaxed) < 60000 {
            return Ok(());
        }
        super::prune_backups(&self.data_dir, now as u64)?;
        self.atomic(|| {
            for table in ["nonces", "sessions", "approvers"] {
                self.run(&format!("DELETE FROM {table} WHERE expires<=?"), [now])?;
            }
            Ok(())
        })?;
        self.maintained.store(now, Ordering::Relaxed);
        Ok(())
    }
}
