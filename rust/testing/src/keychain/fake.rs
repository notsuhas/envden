use envden_core::{adapters::*, errors::Result};
pub type TOwnerOnly = Box<dyn Fn() -> Result<bool> + Send + Sync>;
pub type TGet = Box<dyn Fn(&str, bool) -> Result<Option<Vec<u8>>> + Send + Sync>;
pub type TSet = Box<dyn Fn(&str, &[u8]) -> Result<()> + Send + Sync>;
pub type TDelete = Box<dyn Fn(&str) -> Result<()> + Send + Sync>;
pub struct IFakeKeychainAdapter {
    pub id: String,
    pub owner_only: Option<TOwnerOnly>,
    pub get: Option<TGet>,
    pub set: Option<TSet>,
    pub delete: Option<TDelete>,
}
impl Default for IFakeKeychainAdapter {
    fn default() -> Self {
        Self {
            id: "fake-keychain".into(),
            owner_only: None,
            get: None,
            set: None,
            delete: None,
        }
    }
}
impl IKeychainAdapter for IFakeKeychainAdapter {
    fn id(&self) -> &str {
        &self.id
    }
    fn owner_only(&self) -> Result<bool> {
        self.owner_only
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: keychain.ownerOnly"))()
    }
    fn get(&self, name: &str, required: bool) -> Result<Option<Vec<u8>>> {
        self.get
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: keychain.get"))(
            name, required
        )
    }
    fn set(&self, name: &str, value: &[u8]) -> Result<()> {
        self.set
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: keychain.set"))(
            name, value
        )
    }
    fn delete(&self, name: &str) -> Result<()> {
        self.delete
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: keychain.delete"))(name)
    }
}
