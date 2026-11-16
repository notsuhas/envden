pub mod files;
pub mod lock;
mod model;
pub mod repository;

pub use model::{NOT_SET_UP, TLocalState, empty_state, require_configured};
pub mod journal;
pub mod records;

mod collections;

pub(crate) use model::truthy;
