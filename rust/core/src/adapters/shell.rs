use crate::errors::Result;
pub trait IShellAdapter: Send + Sync {
    fn id(&self) -> &str;
    fn rc_path(&self) -> Result<String>;
    fn hook_snippet(&self, binary_path: &str) -> Result<String>;
    fn installed(&self) -> Result<bool>;
    fn install(&self, binary_path: &str) -> Result<()>;
    fn uninstall(&self) -> Result<()>;
}
