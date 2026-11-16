use crate::{
    adapter::SqliteStorageAdapter,
    db::{fail, invalid, name, sync_dir},
};
use envden_core::{adapters::*, errors::Result};
use rusqlite::params;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
};

impl SqliteStorageAdapter {
    pub(crate) fn blob_path(&self, vault: &[u8], hash: &[u8]) -> PathBuf {
        self.data_dir
            .join("blobs")
            .join(name(vault))
            .join(name(hash))
    }
    pub(crate) fn put_blob(
        &self,
        vault: &[u8],
        hash: &[u8],
        bytes: &[u8],
        verify: Option<TVerifyBlob<'_>>,
        now: Option<u64>,
        quota: Option<u64>,
    ) -> Result<()> {
        if verify.is_some_and(|v| v(bytes) != hash) {
            return Err(invalid("Blob hash mismatch"));
        }
        self.atomic(|| {
            let used = self.vault_usage(vault)?;
            let prior = self.one("SELECT size FROM blob_usage WHERE vault=? AND hash=?", params![vault, hash], |r| r.get::<_, i64>(0).map(|v| v as u64))?.unwrap_or(0);
            self.check_growth(vault, used, used - prior + bytes.len() as u64, quota.unwrap_or(VAULT_QUOTA_BYTES))?;
            let path = self.blob_path(vault, hash); let dir = path.parent().unwrap();
            let mut builder = fs::DirBuilder::new(); builder.recursive(true);
            #[cfg(unix)] { use std::os::unix::fs::DirBuilderExt; builder.mode(0o700); }
            builder.create(dir).map_err(fail)?;
            let temp = dir.join(format!(".tmp-{}", uuid::Uuid::new_v4()));
            let result = (|| {
                let mut options = OpenOptions::new(); options.write(true).create_new(true);
                #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
                let mut file = options.open(&temp).map_err(fail)?;
                #[cfg(test)]
                tests::exit_at("partial", &mut file);
                file.write_all(bytes).map_err(fail)?; file.sync_all().map_err(fail)?; drop(file);
                if let Err(error) = fs::hard_link(&temp, &path) {
                    if !path.exists() { return Err(fail(error)); }
                    if fs::read(&path).map_err(fail)? != bytes { return Err(invalid("Conflicting content for blob hash")); }
                }
                #[cfg(test)]
                tests::exit_at("published", &mut fs::File::open(&path).map_err(fail)?);
                sync_dir(dir)?;
                self.run("INSERT OR IGNORE INTO blobs VALUES(?,?)", params![vault, hash])?;
                self.run("INSERT INTO blob_usage VALUES(?,?,?,?) ON CONFLICT(vault,hash) DO UPDATE SET at=excluded.at", params![vault, hash, bytes.len() as i64, now.unwrap_or(0) as f64])?;
                Ok(())
            })();
            if temp.exists() { fs::remove_file(temp).map_err(fail)?; }
            result
        })
    }
    pub(crate) fn get_blob(&self, vault: &[u8], hash: &[u8]) -> Result<Option<Vec<u8>>> {
        if self
            .bytes(
                "SELECT hash FROM blobs WHERE vault=? AND hash=?",
                params![vault, hash],
            )?
            .is_none()
        {
            return Ok(None);
        }
        match fs::read(self.blob_path(vault, hash)) {
            Ok(bytes) => Ok(Some(bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(fail(e)),
        }
    }
    pub(crate) fn has_blob(&self, vault: &[u8], hash: &[u8]) -> Result<bool> {
        Ok(self
            .bytes(
                "SELECT hash FROM blobs WHERE vault=? AND hash=?",
                params![vault, hash],
            )?
            .is_some()
            && self.blob_path(vault, hash).exists())
    }
    pub(crate) fn blob_hashes(&self, vault: &[u8]) -> Result<Vec<Vec<u8>>> {
        self.rows(
            "SELECT hash FROM blobs WHERE vault=? ORDER BY hash",
            [vault],
            |r| r.get(0),
        )
    }
}

#[cfg(test)]
mod tests;
