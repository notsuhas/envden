use super::{dispatch::dispatch, types::AppState};
use crate::{http::types::IAppOptions, middleware::budget::BodyBudget, status::IStatusState};
use axum::Router;
use envden_core::errors::Result;
use envden_protocol::protocol::parse_semver;
use std::sync::{Arc, Mutex};

pub fn create_app(options: IAppOptions, status: Arc<Mutex<IStatusState>>) -> Result<Router> {
    create_app_with_budget(options, status, BodyBudget::default())
}

pub fn create_app_with_budget(
    options: IAppOptions,
    status: Arc<Mutex<IStatusState>>,
    budget: BodyBudget,
) -> Result<Router> {
    parse_semver(&options.app_version)?;
    parse_semver(&options.min_client)?;

    Ok(Router::new().fallback(dispatch).with_state(AppState {
        options,
        status,
        budget,
    }))
}
