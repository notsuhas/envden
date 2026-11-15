use envden_core::errors::Result;
use parking_lot::{Mutex, ReentrantMutex};
use rusqlite::Connection;
use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicI64, AtomicUsize},
};

pub struct SqliteStorageAdapter {
    pub(crate) connection: Mutex<Option<Connection>>,
    pub(crate) gate: ReentrantMutex<()>,
    pub(crate) data_dir: PathBuf,
    pub(crate) depth: AtomicUsize,
    pub(crate) maintained: AtomicI64,
}

pub fn create_sqlite_storage_adapter(
    data_dir: impl AsRef<Path>,
    now: u64,
) -> Result<SqliteStorageAdapter> {
    let data_dir = data_dir.as_ref().to_path_buf();
    let connection = crate::db::open_database(&data_dir, now)?;
    let adapter = SqliteStorageAdapter {
        connection: Mutex::new(Some(connection)),
        gate: ReentrantMutex::new(()),
        data_dir,
        depth: AtomicUsize::new(0),
        maintained: AtomicI64::new(now as i64 - 60000),
    };
    adapter.recover_blobs(now)?;
    Ok(adapter)
}
