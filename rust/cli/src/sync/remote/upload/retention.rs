use super::places::IPlaces;
use serde_json::Value;
use std::path::{Path, PathBuf};

pub(super) fn keep_link(link: &Value, removed: &[PathBuf], places: &IPlaces, home: &Path) -> bool {
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
    link["localOnly"] == true
        || !places.contains(&base)
        || !removed.iter().any(|path| Path::new(store) == path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn deletion_preserves_copies_whose_bases_were_not_uploaded() {
        let home = Path::new("/home");
        let mut places = IPlaces::default();
        places.record(home, "/store", Some("/one"));
        let removed = vec![PathBuf::from("/store")];
        for (root, local, expected) in [
            ("/one", false, false),
            ("/two", false, true),
            ("/one", true, true),
        ] {
            let link =
                json!({"root":root,"path":".env","store":"/store","mode":"copy","localOnly":local});
            assert_eq!(keep_link(&link, &removed, &places, home), expected);
        }
    }
}
