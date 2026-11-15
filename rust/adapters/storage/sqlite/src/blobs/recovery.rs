use crate::{adapter::SqliteStorageAdapter, db::fail};
use envden_core::errors::Result;
use rusqlite::params;
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

fn decode(name: &str) -> Option<Vec<u8>> {
    if name == "empty" {
        return Some(vec![]);
    }
    if name.is_empty()
        || !name
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return None;
    }
    hex::decode(&name[..name.len() / 2 * 2]).ok()
}
impl SqliteStorageAdapter {
    pub(crate) fn recover_blobs(&self, now: u64) -> Result<()> {
        self.atomic(|| {
            let root = self.data_dir.join("blobs");
            if !root.exists() {
                return Ok(());
            }
            for entry in fs::read_dir(root).map_err(fail)? {
                let entry = entry.map_err(fail)?;
                if !entry.file_type().map_err(fail)?.is_dir() {
                    continue;
                }
                let Some(vault) = decode(&entry.file_name().to_string_lossy()) else {
                    continue;
                };
                for file in fs::read_dir(entry.path()).map_err(fail)? {
                    let file = file.map_err(fail)?;
                    if !file.file_type().map_err(fail)?.is_file() {
                        continue;
                    }
                    let name = file.file_name();
                    let name = name.to_string_lossy();
                    let temporary = name.starts_with(".tmp-");
                    if temporary {
                        fs::remove_file(file.path()).map_err(fail)?;
                        continue;
                    }
                    let Some(hash) = decode(&name) else {
                        continue;
                    };
                    self.recover_file(&file.path(), &vault, &hash, now)?;
                }
            }
            Ok(())
        })
    }
    fn recover_file(&self, path: &Path, vault: &[u8], hash: &[u8], now: u64) -> Result<()> {
        let present = self
            .bytes(
                "SELECT hash FROM blobs WHERE vault=? AND hash=?",
                params![vault, hash],
            )?
            .is_some();
        if !present
            && self
                .bytes(
                    "SELECT hash FROM blob_garbage WHERE vault=? AND hash=?",
                    params![vault, hash],
                )?
                .is_some()
        {
            fs::remove_file(path).map_err(fail)?;
            return Ok(());
        }
        if !present {
            let bytes = fs::read(path).map_err(fail)?;
            let mut digest = Sha256::new();
            digest.update(14_u32.to_be_bytes());
            digest.update(b"envden/v1/blob");
            digest.update((bytes.len() as u64).to_be_bytes());
            digest.update(bytes);
            if digest.finalize().as_slice() != hash {
                fs::remove_file(path).map_err(fail)?;
                return Ok(());
            }
            self.run(
                "INSERT OR IGNORE INTO blobs VALUES(?,?)",
                params![vault, hash],
            )?;
        }
        self.run(
            "INSERT OR IGNORE INTO blob_usage VALUES(?,?,?,?)",
            params![
                vault,
                hash,
                fs::metadata(path).map_err(fail)?.len() as i64,
                now as f64
            ],
        )?;
        Ok(())
    }
}
