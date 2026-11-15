use crate::adapters::create_adapters;
use envden_core::{adapters::IKeychainAdapter, errors::Result};
use std::path::PathBuf;

struct ILockedKeychain(PathBuf);

impl IKeychainAdapter for ILockedKeychain {
    fn id(&self) -> &str {
        "test"
    }
    fn owner_only(&self) -> Result<bool> {
        Ok(true)
    }
    fn get(&self, _: &str, _: bool) -> Result<Option<Vec<u8>>> {
        panic!("unexpected read")
    }
    fn set(&self, _: &str, _: &[u8]) -> Result<()> {
        panic!("unexpected write")
    }
    fn delete(&self, _: &str) -> Result<()> {
        assert!(self.0.join("state/write.lock/owner.json").exists());
        Ok(())
    }
}

#[test]
fn pairing_cleanup_holds_lock_over_key_and_file_deletion() {
    let dir = tempfile::tempdir().unwrap();
    let mut adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
    adapters.keychain = Box::new(ILockedKeychain(adapters.home.clone()));
    std::fs::create_dir_all(adapters.home.join("state")).unwrap();
    std::fs::write(adapters.home.join("state/pair-pin"), "pin").unwrap();
    super::persistence::clear(&adapters).unwrap();
    assert!(!adapters.home.join("state/pair-pin").exists());
    assert!(!adapters.home.join("state/write.lock").exists());
}
