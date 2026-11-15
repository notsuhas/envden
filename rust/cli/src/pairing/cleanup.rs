use crate::adapters::IAdapters;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

pub(super) enum TPhase {
    Exchange,
    Finish,
}

pub(super) fn run(
    adapters: &IAdapters,
    phase: TPhase,
    action: impl FnOnce() -> Result<Value>,
) -> Result<Value> {
    let result = action();
    if let Err(error) = &result {
        let incomplete = !adapters.home.join("state/pair-joiner").exists();
        let clear = if matches!(phase, TPhase::Finish) {
            matches!(
                error.code,
                ErrorCode::Unauthorized | ErrorCode::InvalidData | ErrorCode::Fork
            )
        } else {
            incomplete
                || matches!(
                    error.code,
                    ErrorCode::Unauthorized
                        | ErrorCode::Conflict
                        | ErrorCode::InvalidData
                        | ErrorCode::NotFound
                )
        };
        if clear {
            super::persistence::clear(adapters)?;
        }
        if matches!(phase, TPhase::Exchange) && incomplete && error.code == ErrorCode::Busy {
            return Err(EnvdenError::new(
                ErrorCode::Busy,
                "Pairing timed out before login; create a new pairing code",
            ));
        }
    }
    result
}
