use crate::state::files::{atomic_write, optional_read};
use envden_core::errors::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IUpdateCache {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked_at: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip)]
    pub(crate) order: Vec<&'static str>,
}

pub fn read_update_cache(home: &Path) -> IUpdateCache {
    let mut cache = optional_read(&home.join("state/updates.json"))
        .ok()
        .flatten()
        .and_then(|s| {
            let value: serde_json::Value = serde_json::from_str(&s).ok()?;
            if !value.is_object()
                || value.get("checkedAt").is_some_and(|v| !v.is_number())
                || ["latest", "message"]
                    .iter()
                    .any(|key| value.get(key).is_some_and(|v| !v.is_string()))
            {
                return None;
            }
            serde_json::from_value::<IUpdateCache>(value).ok()
        })
        .unwrap_or_default();
    if cache
        .latest
        .as_deref()
        .is_some_and(|s| envden_protocol::protocol::compare_semver(s, "0.0.0").is_err())
    {
        return IUpdateCache::default();
    }
    if cache.checked_at.is_some() {
        cache.order.push("checkedAt");
    }
    if cache.latest.is_some() {
        cache.order.push("latest");
    }
    if cache.message.is_some() {
        cache.order.push("message");
    }
    cache
}

pub fn save_update_cache(home: &Path, cache: &IUpdateCache, now: u64) -> Result<()> {
    let mut value = serde_json::Map::new();
    let mut order = cache.order.clone();
    for key in ["checkedAt", "latest", "message"] {
        if !order.contains(&key) {
            order.push(key);
        }
    }
    for key in order {
        let field = match key {
            "checkedAt" => cache.checked_at.map(|n| serde_json::json!(n)),
            "latest" => cache
                .latest
                .as_ref()
                .map(|s| serde_json::Value::String(s.clone())),
            "message" => cache
                .message
                .as_ref()
                .map(|s| serde_json::Value::String(s.clone())),
            _ => None,
        };
        if let Some(field) = field {
            value.insert(key.into(), field);
        }
    }
    atomic_write(
        &home.join("state/updates.json"),
        crate::state::json::stringify(&value).as_bytes(),
        now,
    )
}
