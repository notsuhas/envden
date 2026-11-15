use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::{adapters::storage::IStorageAdapter, errors::Result};
use std::{path::Path, sync::Arc};

pub(crate) fn create_adapters(data_dir: &Path, now: u64) -> Result<Arc<dyn IStorageAdapter>> {
    Ok(Arc::new(create_sqlite_storage_adapter(data_dir, now)?))
}
