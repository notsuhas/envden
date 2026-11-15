use super::{
    cache::{IUpdateCache, read_update_cache, save_update_cache},
    fetch::IFetcher,
    github::latest_release,
};
use crate::{
    adapters::IAdapters, settings::read_config, state::lock::with_state_lock, version::VERSION,
};
use envden_core::errors::Result;
use serde_json::{Value, json};

pub fn check_release(
    cache: &mut IUpdateCache,
    now: u64,
    fetcher: &dyn IFetcher,
    force: bool,
) -> Value {
    if !force
        && cache
            .checked_at
            .is_some_and(|t| (now as f64) - t < 86400000.0)
    {
        return json!({"kind":"skipped"});
    }
    let result = match latest_release(fetcher) {
        Ok(latest) => {
            if cache.latest.is_none() {
                cache.order.push("latest");
            }
            cache.latest = Some(latest.clone());
            cache.message = None;
            cache.order.retain(|k| *k != "message");
            json!({"kind":"checked","latest":latest,"available":envden_protocol::protocol::compare_semver(&latest, VERSION).is_ok_and(|o| o.is_gt())})
        }
        Err(_) => {
            if cache.message.is_none() {
                cache.order.push("message");
            }
            cache.message = Some("Cannot confirm envden is up to date".into());
            json!({"kind":"unavailable","message":cache.message})
        }
    };
    if cache.checked_at.is_none() {
        cache.order.push("checkedAt");
    }
    cache.checked_at = Some(now as f64);
    result
}

pub fn run_update_check(
    adapters: &IAdapters,
    now: u64,
    force: bool,
    fetcher: &dyn IFetcher,
) -> Result<Value> {
    let config = read_config(&adapters.home)?;
    if !force
        && (config["update-check"] == false
            || std::env::var("ENVDEN_NO_UPDATE_CHECK").as_deref() == Ok("1"))
    {
        return Ok(json!({"kind":"skipped"}));
    }
    let mut cache = read_update_cache(&adapters.home);
    let result = check_release(&mut cache, now, fetcher, force);
    if result["kind"] != "skipped" {
        with_state_lock(&adapters.home, (adapters.now)(), || {
            save_update_cache(&adapters.home, &cache, (adapters.now)())
        })?;
    }
    Ok(result)
}
