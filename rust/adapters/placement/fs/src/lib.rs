#[cfg(unix)]
mod adapter;
#[cfg(unix)]
mod backup;
#[cfg(unix)]
mod native;
mod paths;
#[cfg(unix)]
pub use adapter::create_fs_placement_adapter;
#[cfg(unix)]
mod prune;
#[cfg(unix)]
pub use prune::prune_backups;
mod inspect;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::{create_fs_placement_adapter, prune_backups};
