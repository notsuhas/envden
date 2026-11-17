use std::collections::{HashMap, HashSet};
use unicode_normalization::UnicodeNormalization;

pub fn path_collisions(paths: &[String], insensitive: bool) -> HashSet<usize> {
    let mut spellings = HashMap::new();
    let mut collisions = HashSet::new();
    let mut ordered: Vec<_> = paths.iter().enumerate().collect();
    ordered.sort_by(|a, b| a.1.encode_utf16().cmp(b.1.encode_utf16()));

    for (index, path) in ordered {
        let parts: Vec<_> = path.split('/').collect();
        for length in 1..=parts.len() {
            let prefix = parts[..length].join("/");
            let normalized: String = prefix.nfc().collect();
            let key = if insensitive {
                normalized.to_lowercase()
            } else {
                normalized
            };
            if spellings
                .get(&key)
                .is_some_and(|previous| previous != &prefix)
            {
                collisions.insert(index);
            } else {
                spellings.insert(key, prefix);
            }
        }
    }
    collisions
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lexically_later_aliases_and_directory_aliases_collide() {
        let paths = [
            ".env",
            ".ENV",
            "é/.env",
            "e\u{301}/.env",
            "Dir/.env",
            "dir/.env.local",
        ]
        .map(str::to_owned);
        assert_eq!(path_collisions(&paths, false), HashSet::from([2]));
        assert_eq!(path_collisions(&paths, true), HashSet::from([0, 2, 5]));
    }

    #[test]
    fn collision_entry_order() {
        for paths in [
            ["Dir/.env", "dir/.env.local"],
            ["dir/.env.local", "Dir/.env"],
        ] {
            let paths = paths.map(str::to_owned);
            let got: Vec<_> = path_collisions(&paths, true)
                .into_iter()
                .map(|i| paths[i].as_str())
                .collect();
            assert_eq!(got, ["dir/.env.local"]);
            assert!(path_collisions(&paths, false).is_empty());
        }
    }
}
