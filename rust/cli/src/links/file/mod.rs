mod base;
mod choice;
mod existing;
mod link;

pub use base::mode_name;
pub use link::{IOwnLink, link_file};

#[cfg(all(test, unix))]
mod tests;
