mod adapters;
mod app;
pub mod http;
pub mod identity;
pub mod lifecycle;
pub mod repair;
pub mod status;

pub use app::create_app;
pub use lifecycle::serve::{IServeOptions, RunningServer, serve};

pub mod middleware;
mod vault;

mod auth;
mod routes;

mod pairing;

#[path = "move/mod.rs"]
mod moving;
