use crate::errors::Result;
pub trait IKeychainAdapter: Send + Sync {
    fn id(&self) -> &str;
    fn owner_only(&self) -> Result<bool>;
    fn get(&self, name: &str, required: bool) -> Result<Option<Vec<u8>>>;
    fn set(&self, name: &str, value: &[u8]) -> Result<()>;
    fn delete(&self, name: &str) -> Result<()>;
}
