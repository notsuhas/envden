use super::{dispatch::dispatch, types::AppState};
use crate::{http::types::IAppOptions, status::IStatusState};
use axum::Router;
use envden_core::errors::Result;
use envden_protocol::protocol::parse_semver;
use std::sync::{Arc, Mutex};

pub fn create_app(options: IAppOptions, status: Arc<Mutex<IStatusState>>) -> Result<Router> {
    parse_semver(&options.app_version)?;
    parse_semver(&options.min_client)?;

    Ok(Router::new().fallback(dispatch).with_state(AppState {
        options,
        status,
        budget: Default::default(),
    }))
}
