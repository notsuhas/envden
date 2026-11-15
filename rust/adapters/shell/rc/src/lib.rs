mod adapter;
mod edit;
mod profile;
mod render;
pub use adapter::{TResolveProfile, create_rc_shell_adapter};
pub use render::TShell;
mod edit_files;
#[cfg(windows)]
mod windows;
