use super::exchange::{put, wait};
use crate::{adapters::IAdapters, client::IClient, identity::IDeviceIdentity};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

pub(super) fn finish(
    adapters: &IAdapters,
    client: &IClient,
    identity: &IDeviceIdentity,
    rejoin: bool,
) -> Result<Value> {
    super::cleanup::run(adapters, super::cleanup::TPhase::Finish, || {
        let expiry = std::fs::read_to_string(adapters.home.join("state/pair-expiry"))
            .ok()
            .and_then(|v| v.parse::<u64>().ok());
        if expiry.is_some_and(|v| (adapters.now)() < v)
            && let Ok(saved) = std::fs::read_to_string(adapters.home.join("state/pair-joiner"))
        {
            let value: Value = serde_json::from_str(&saved).map_err(|e| {
                EnvdenError::with_source(
                    ErrorCode::InvalidData,
                    "Invalid stored pairing exchange",
                    e,
                )
            })?;
            let mailbox = value["mailbox"].as_u64().ok_or_else(|| {
                EnvdenError::new(ErrorCode::InvalidData, "Invalid stored pairing exchange")
            })? as u32;
            for (slot, field) in [("KE3", "ke3"), ("PairJoiner", "message")] {
                let message = value[field].as_str().ok_or_else(|| {
                    EnvdenError::new(ErrorCode::InvalidData, "Invalid stored pairing exchange")
                })?;
                if let Err(error) = put(client, mailbox, slot, message)
                    && error.code != ErrorCode::NotFound
                {
                    return Err(error);
                }
            }
        }
        wait(
            client,
            "/v1/pairing/approver",
            adapters.now,
            expiry
                .map(|v| v.saturating_add(86_400_000))
                .unwrap_or_else(|| (adapters.now)() + 86_400_000),
        )?;
        super::resume::resume(adapters, client, identity, rejoin)
    })
}
