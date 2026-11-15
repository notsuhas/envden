mod adapter;
mod backup;
mod place;
mod prune;
pub(crate) mod state;
pub use adapter::create_fs_placement_adapter;
pub use prune::prune_backups;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod unsafe_tests;
