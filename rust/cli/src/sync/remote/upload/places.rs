use crate::sync::local::files::base_path;
use std::path::Path;

#[derive(Default)]
pub(super) struct IPlaces {
    changed: Vec<String>,
    shared: Vec<String>,
}

impl IPlaces {
    pub fn record(&mut self, home: &Path, store: &str, copy_root: Option<&str>) {
        let base = base_path(home, store, copy_root)
            .to_string_lossy()
            .into_owned();
        if !self.changed.contains(&base) {
            self.changed.push(base);
        }
        let shared = base_path(home, store, None).to_string_lossy().into_owned();
        if !self.shared.contains(&shared) {
            self.shared.push(shared);
        }
    }
    pub fn receipts(&self) -> Vec<String> {
        let mut receipts = self.changed.clone();
        for base in &self.shared {
            if !receipts.contains(base) {
                receipts.push(base.clone());
            }
        }
        receipts
    }
    pub fn contains(&self, base: &Path) -> bool {
        self.changed
            .iter()
            .any(|changed| Path::new(changed) == base)
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
        copies.record(home, "/store", Some("/one"));
        copies.record(home, "/store", Some("/two"));
        assert_eq!(copies.count(), 2);
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
        links.record(home, "/store", None);
        links.record(home, "/store", None);
        assert_eq!(links.count(), 1);
        assert_eq!(links.receipts().len(), 1);
    }
}
