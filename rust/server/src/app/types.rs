use crate::{http::types::IAppOptions, status::IStatusState};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub(super) struct AppState {
    pub options: IAppOptions,
    pub status: Arc<Mutex<IStatusState>>,
    pub budget: crate::middleware::budget::BodyBudget,
}
