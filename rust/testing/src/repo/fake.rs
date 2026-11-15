use envden_core::{adapters::*, errors::Result};
pub type TCaseInsensitive = Box<dyn Fn(&str, bool) -> Result<bool> + Send + Sync>;
pub type TCheckoutAt = Box<dyn Fn(&str) -> Result<Option<ICheckout>> + Send + Sync>;
pub type TWorktrees = Box<dyn Fn(&ICheckout) -> Result<Vec<String>> + Send + Sync>;
pub type TSubmodules = Box<dyn Fn(&ICheckout) -> Result<Vec<String>> + Send + Sync>;
pub type TEnvFiles =
    Box<dyn Fn(&ICheckout, Option<&IEnvFileRules>) -> Result<Vec<String>> + Send + Sync>;
pub type TIsIgnored = Box<dyn Fn(&ICheckout, &str) -> Result<bool> + Send + Sync>;
pub type TEnsureIgnored = Box<dyn Fn(&ICheckout, &str) -> Result<()> + Send + Sync>;
pub struct IFakeRepoAdapter {
    pub id: String,
    pub case_insensitive: Option<TCaseInsensitive>,
    pub checkout_at: Option<TCheckoutAt>,
    pub worktrees: Option<TWorktrees>,
    pub submodules: Option<TSubmodules>,
    pub env_files: Option<TEnvFiles>,
    pub is_ignored: Option<TIsIgnored>,
    pub ensure_ignored: Option<TEnsureIgnored>,
}
impl Default for IFakeRepoAdapter {
    fn default() -> Self {
        Self {
            id: "fake-repo".into(),
            case_insensitive: None,
            checkout_at: None,
            worktrees: None,
            submodules: None,
            env_files: None,
            is_ignored: None,
            ensure_ignored: None,
        }
    }
}
impl IRepoAdapter for IFakeRepoAdapter {
    fn id(&self) -> &str {
        &self.id
    }
    fn case_insensitive(&self, root: &str, read_only: bool) -> Result<bool> {
        self.case_insensitive
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: repo.caseInsensitive"))(
            root, read_only,
        )
    }
    fn checkout_at(&self, path: &str) -> Result<Option<ICheckout>> {
        self.checkout_at
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: repo.checkoutAt"))(path)
    }
    fn worktrees(&self, checkout: &ICheckout) -> Result<Vec<String>> {
        self.worktrees
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: repo.worktrees"))(checkout)
    }
    fn submodules(&self, checkout: &ICheckout) -> Result<Vec<String>> {
        self.submodules
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: repo.submodules"))(
            checkout
        )
    }
    fn env_files(
        &self,
        checkout: &ICheckout,
        options: Option<&IEnvFileRules>,
    ) -> Result<Vec<String>> {
        self.env_files
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: repo.envFiles"))(
            checkout, options,
        )
    }
    fn is_ignored(&self, checkout: &ICheckout, rel_path: &str) -> Result<bool> {
        self.is_ignored
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: repo.isIgnored"))(
            checkout, rel_path,
        )
    }
    fn ensure_ignored(&self, checkout: &ICheckout, rel_path: &str) -> Result<()> {
        self.ensure_ignored
            .as_ref()
            .unwrap_or_else(|| panic!("Unexpected fake operation: repo.ensureIgnored"))(
            checkout, rel_path,
        )
    }
}
