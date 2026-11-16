use envden_adapter_storage_sqlite::{SqliteStorageAdapter, create_sqlite_storage_adapter};
use envden_core::adapters::*;

pub fn setup() -> (tempfile::TempDir, SqliteStorageAdapter) {
    let dir = tempfile::tempdir().unwrap();
    let db = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
    (dir, db)
}
pub fn vault(active: bool) -> IStoredVault {
    IStoredVault {
        active,
        ..Default::default()
    }
}
