use envden_core::adapters::storage::IStorageAdapter;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IServerKeys {
    pub secret_key: [u8; 32],
    pub public_key: [u8; 32],
    pub opaque_setup: String,
}

pub type TClock = Arc<dyn Fn() -> u64 + Send + Sync>;

#[derive(Clone)]
pub struct IAppOptions {
    pub storage: Arc<dyn IStorageAdapter>,
    pub storage_lock: Arc<Mutex<()>>,
    pub now: TClock,
    pub server_keys: IServerKeys,
    pub app_version: String,
    pub min_client: String,
}
