pub mod cache;
pub mod check;
pub mod download;
pub mod fetch;
pub mod github;
pub mod maintenance;
pub mod status;

pub mod self_update;

#[cfg(test)]
mod tests;

mod deadline;

#[cfg(test)]
mod lock_tests;
