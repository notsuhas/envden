use crate::adapter::SqliteStorageAdapter;
use envden_core::errors::Result;
use rusqlite::params;
use std::{fs, sync::atomic::Ordering};

impl SqliteStorageAdapter {
    pub(crate) fn collect_garbage(&self) -> Result<()> {
        if self.depth.load(Ordering::Relaxed) > 0 {
            return Ok(());
        }
        self.atomic(|| {
            let garbage = self.rows("SELECT vault,hash FROM blob_garbage", [], |r| {
                Ok((r.get::<_, Vec<u8>>(0)?, r.get::<_, Vec<u8>>(1)?))
            })?;
            for (vault, hash) in garbage {
                if self
                    .bytes(
                        "SELECT hash FROM blobs WHERE vault=? AND hash=?",
                        params![vault, hash],
                    )?
                    .is_none()
                    && let Err(error) = fs::remove_file(self.blob_path(&vault, &hash))
                    && error.kind() != std::io::ErrorKind::NotFound
                {
                    continue;
                }
                self.run(
                    "DELETE FROM blob_garbage WHERE vault=? AND hash=?",
                    params![vault, hash],
                )?;
            }
            Ok(())
        })
    }
}
