use std::collections::{HashMap, HashSet};
use unicode_normalization::UnicodeNormalization;

pub fn path_collisions(paths: &[String], insensitive: bool) -> HashSet<usize> {
    let mut spellings = HashMap::new();
    let mut collisions = HashSet::new();
    for (index, path) in paths.iter().enumerate() {
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
    fn later_aliases_and_directory_aliases_collide() {
        let paths = [
            ".env",
            ".ENV",
            "é/.env",
            "e\u{301}/.env",
            "Dir/.env",
            "dir/.env.local",
        ]
        .map(str::to_owned);
        assert_eq!(path_collisions(&paths, false), HashSet::from([3]));
        assert_eq!(path_collisions(&paths, true), HashSet::from([1, 3, 5]));
    }
}
