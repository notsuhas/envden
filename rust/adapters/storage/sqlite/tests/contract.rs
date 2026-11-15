use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_testing::storage::{IStorageFixture, blob_staging_contract, storage_contract};
use std::sync::Arc;

fn fixture() -> IStorageFixture {
    let dir = Arc::new(tempfile::tempdir().unwrap());
    let storage = Arc::new(create_sqlite_storage_adapter(dir.path(), 0).unwrap());
    let reopen_dir = dir.clone();
    IStorageFixture {
        storage,
        reopen: Box::new(move || {
            Arc::new(create_sqlite_storage_adapter(reopen_dir.path(), 0).unwrap())
        }),
        dispose: Box::new(move || {
            let _ = &dir;
        }),
    }
}
#[test]
fn storage() {
    storage_contract(fixture);
}
#[test]
fn blob_staging() {
    let f = fixture();
    blob_staging_contract(f.storage.as_ref());
}
