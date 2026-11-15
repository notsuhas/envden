use crate::errors::Result;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TPlacementMode {
    Link,
    Copy,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TPlacementState {
    Linked,
    Relinkable,
    Detached,
    Missing,
}
pub type TPrepareTemporary<'a> = &'a (dyn Fn(&str) -> Result<()> + Send + Sync);
pub trait IPlacementAdapter: Send + Sync {
    fn mode(&self) -> TPlacementMode;
    fn supported(&self, dir: &str) -> Result<bool>;
    fn place(
        &self,
        store_path: &str,
        checkout_path: &str,
        prepare_temporary: Option<TPrepareTemporary<'_>>,
        replacing_link: Option<&str>,
    ) -> Result<()>;
    fn remove(&self, store_path: Option<&str>, checkout_path: &str) -> Result<()>;
    fn inspect(&self, store_path: &str, checkout_path: &str) -> Result<TPlacementState>;
}
