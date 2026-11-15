use envden_core::{adapters::*, errors::Result};
pub type TRcPath = Box<dyn Fn() -> String + Send + Sync>;
pub type THookSnippet = Box<dyn Fn(&str) -> String + Send + Sync>;
pub type TInstalled = Box<dyn Fn() -> Result<bool> + Send + Sync>;
pub type TInstall = Box<dyn Fn(&str) -> Result<()> + Send + Sync>;
pub type TUninstall = Box<dyn Fn() -> Result<()> + Send + Sync>;
pub struct IFakeShellAdapter {
    pub id: String,
    pub rc_path: Option<TRcPath>,
    pub hook_snippet: Option<THookSnippet>,
    pub installed: Option<TInstalled>,
    pub install: Option<TInstall>,
    pub uninstall: Option<TUninstall>,
}
impl Default for IFakeShellAdapter {
    fn default() -> Self {
        Self {
            id: "fake-shell".into(),
            rc_path: None,
            hook_snippet: None,
            installed: None,
            install: None,
            uninstall: None,
        }
    }
}
impl IShellAdapter for IFakeShellAdapter {
    fn id(&self) -> &str {
        &self.id
    }
    fn rc_path(&self) -> String {
        self.rc_path
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: shell.rcPath"))()
    }
    fn hook_snippet(&self, binary_path: &str) -> String {
        self.hook_snippet
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: shell.hookSnippet"))(
            binary_path
        )
    }
    fn installed(&self) -> Result<bool> {
        self.installed
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: shell.installed"))()
    }
    fn install(&self, binary_path: &str) -> Result<()> {
        self.install
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: shell.install"))(
            binary_path
        )
    }
    fn uninstall(&self) -> Result<()> {
        self.uninstall
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: shell.uninstall"))()
    }
}
