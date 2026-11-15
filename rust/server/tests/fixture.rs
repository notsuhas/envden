use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_server::{http::types::IAppOptions, identity::load_server_keys};
use std::sync::{Arc, Mutex};

pub fn fixture() -> (tempfile::TempDir, IAppOptions) {
    let directory = tempfile::tempdir().unwrap();
    let keys = load_server_keys(directory.path()).unwrap();
    let options = IAppOptions {
        storage: Arc::new(create_sqlite_storage_adapter(directory.path(), 1000000).unwrap()),
        storage_lock: Arc::new(Mutex::new(())),
        now: Arc::new(|| 1000000),
        server_keys: keys,
        app_version: "1.0.0".into(),
        min_client: "0.0.0".into(),
    };

    (directory, options)
}
