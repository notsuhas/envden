use super::{IStatusState, derive_quota_band, derive_server_mode};
use crate::http::types::IAppOptions;
use envden_core::errors::Result;
use serde_json::{Value, json};

pub fn read_status(options: &IAppOptions, state: &IStatusState) -> Result<Value> {
    let ids = options.storage.vault_ids()?;
    let usages = ids
        .iter()
        .map(|id| options.storage.vault_usage(id))
        .collect::<Result<Vec<_>>>()?;
    let vaults = ids
        .iter()
        .map(|id| options.storage.vault(id))
        .collect::<Result<Vec<_>>>()?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let last = state.last_prune.map(|(at,ok)| json!({"at":chrono::DateTime::from_timestamp_millis(at as i64).expect("valid timestamp").to_rfc3339_opts(chrono::SecondsFormat::Millis,true),"ok":ok}));
    let mut result = serde_json::Map::new();
    for (key, value) in [
        ("version", json!(options.app_version)),
        (
            "uptimeSeconds",
            json!((options.now)().saturating_sub(state.started_at) / 1000),
        ),
        ("mode", json!(derive_server_mode(&vaults))),
        ("vaults", json!(ids.len())),
        ("storageBytes", json!(usages.iter().sum::<u64>())),
        ("fullestVault", json!(derive_quota_band(&usages))),
        ("lastPrune", json!(last)),
    ] {
        result.insert(key.into(), value);
    }

    Ok(Value::Object(result))
}
