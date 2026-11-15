mod factory;
mod implementation;

pub use factory::{SqliteStorageAdapter, create_sqlite_storage_adapter};

mod forwarding;
