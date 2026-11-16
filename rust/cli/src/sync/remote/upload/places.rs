use crate::sync::local::files::base_path;
use std::path::Path;

#[derive(Default)]
pub(super) struct IPlaces {
    changed: Vec<(String, bool)>,
    shared: Vec<String>,
}

impl IPlaces {
    pub fn record(&mut self, home: &Path, store: &str, copy_root: Option<&str>, deleted: bool) {
        let base = base_path(home, store, copy_root)
            .to_string_lossy()
            .into_owned();
        if let Some((_, was_deleted)) = self
            .changed
            .iter_mut()
            .find(|(changed, _)| changed == &base)
        {
            *was_deleted = deleted;
        } else {
            self.changed.push((base, deleted));
        }

        let shared = base_path(home, store, None).to_string_lossy().into_owned();
        if !self.shared.contains(&shared) {
            self.shared.push(shared);
        }
    }

    pub fn receipts(&self) -> Vec<String> {
        let mut receipts: Vec<_> = self.changed.iter().map(|(base, _)| base.clone()).collect();
        for base in &self.shared {
            if !receipts.contains(base) {
                receipts.push(base.clone());
            }
        }

        receipts
    }

    pub fn is_deleted(&self, base: &Path) -> bool {
        self.changed
            .iter()
            .any(|(changed, deleted)| *deleted && Path::new(changed) == base)
    }

    pub fn count(&self) -> usize {
        self.changed.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn two_copies_keep_both_bases_but_link_targets_share_one() {
        let home = Path::new("/home");
        let mut copies = IPlaces::default();
        copies.record(home, "/store", Some("/one"), true);
        copies.record(home, "/store", Some("/two"), false);
        assert_eq!(copies.count(), 2);
        assert!(copies.is_deleted(&base_path(home, "/store", Some("/one"))));
        assert!(!copies.is_deleted(&base_path(home, "/store", Some("/two"))));
        assert_eq!(
            copies.receipts(),
            [
                base_path(home, "/store", Some("/one")),
                base_path(home, "/store", Some("/two")),
                base_path(home, "/store", None)
            ]
            .map(|p| p.to_string_lossy().into_owned())
        );
        let mut links = IPlaces::default();
        links.record(home, "/store", None, true);
        links.record(home, "/store", None, false);
        assert!(!links.is_deleted(&base_path(home, "/store", None)));
        assert_eq!(links.count(), 1);
        assert_eq!(links.receipts().len(), 1);
    }
}
