use super::places::IPlaces;
use serde_json::Value;
use std::path::Path;

pub(super) fn keep_link(link: &Value, places: &IPlaces, home: &Path) -> bool {
    let store = link["store"].as_str().unwrap_or_default();
    let base = crate::sync::local::files::base_path(
        home,
        store,
        if link["mode"] == "copy" {
            link["root"].as_str()
        } else {
            None
        },
    );
    link["localOnly"] == true || !places.is_deleted(&base)
}

#[cfg(test)]
mod tests;
