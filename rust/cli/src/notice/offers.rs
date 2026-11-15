use super::cache::safe_root;
use crate::{
    adapters::IAdapters,
    settings::read_config,
    state::files::{atomic_write, optional_read},
};
use envden_core::{
    adapters::IEnvFileRules,
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::{Map, Value};

pub fn cache_offers(
    adapters: &IAdapters,
    state: &Value,
    cwd: Option<&str>,
    update: &Value,
    now: u64,
) -> Result<()> {
    let path = adapters.home.join("state/track-offers");
    let mut roots = Vec::new();
    for root in optional_read(&path)?
        .unwrap_or_default()
        .split('\n')
        .filter(|r| safe_root(r))
    {
        if !roots.iter().any(|r| r == root) {
            roots.push(root.to_string());
        }
    }
    if let Some(cwd) = cwd {
        scan_offer(adapters, state, cwd, &mut roots, now)?;
    }
    roots.retain(|r| !approved(state, r));
    atomic_write(&path, lines(&roots).as_bytes(), (adapters.now)())?;
    let mut notices = Vec::new();
    if update["available"] == true {
        notices.push("envden: update available; run envden update".into());
    }
    if update["required"] == true {
        notices.push("envden: update required; run envden update".into());
    }
    atomic_write(
        &adapters.home.join("state/notice-update"),
        lines(&notices).as_bytes(),
        (adapters.now)(),
    )
}

fn approved(state: &Value, root: &str) -> bool {
    state["approved"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|c| c["root"] == root)
}

fn lines(values: &[String]) -> String {
    if values.is_empty() {
        String::new()
    } else {
        format!("{}\n", values.join("\n"))
    }
}

fn scan_offer(
    adapters: &IAdapters,
    state: &Value,
    cwd: &str,
    roots: &mut Vec<String>,
    now: u64,
) -> Result<()> {
    let Some(checkout) = adapters.repo.checkout_at(cwd).ok().flatten() else {
        return Ok(());
    };
    if !safe_root(&checkout.root)
        || roots.contains(&checkout.root)
        || approved(state, &checkout.root)
    {
        return Ok(());
    }
    let path = adapters.home.join("state/track-scanned.json");
    let saved: Value = serde_json::from_str(&optional_read(&path)?.unwrap_or_else(|| "{}".into()))
        .map_err(|e| EnvdenError::with_source(ErrorCode::InvalidData, "Invalid scan cache", e))?;
    let mut entries: Vec<_> = saved
        .as_object()
        .filter(|o| o.values().all(Value::is_number))
        .into_iter()
        .flatten()
        .filter(|(_, v)| (now as f64) - v.as_f64().unwrap_or(0.0) < 60000.0)
        .collect();
    entries.sort_by(|(_, a), (_, b)| {
        b.as_f64()
            .partial_cmp(&a.as_f64())
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut scans: Map<String, Value> = entries
        .into_iter()
        .take(255)
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    if scans
        .get(&checkout.root)
        .and_then(Value::as_f64)
        .is_some_and(|t| (now as f64) - t < 60000.0)
    {
        return Ok(());
    }
    let config = read_config(&adapters.home)?;
    let rules = &config["env-files"];
    let strings = |key: &str| {
        rules[key].as_array().map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
    };
    let rules = IEnvFileRules {
        include: strings("include"),
        exclude: strings("exclude"),
        extra_skipped: strings("extraSkipped"),
    };
    if !adapters.repo.env_files(&checkout, Some(&rules))?.is_empty() {
        roots.push(checkout.root.clone());
    }
    scans.insert(checkout.root, Value::from(now));
    atomic_write(
        &path,
        Value::Object(scans).to_string().as_bytes(),
        (adapters.now)(),
    )
}
