use crate::errors::Result;
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ICheckout {
    pub root: String,
    pub repo_id: String,
    pub upstream_repo_id: Option<String>,
    pub git_dir: String,
    pub identity: Option<String>,
    pub root_device: Option<u64>,
    pub registered_worktree: Option<bool>,
}
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct IEnvFileRules {
    pub include: Option<Vec<String>>,
    pub exclude: Option<Vec<String>>,
    pub extra_skipped: Option<Vec<String>>,
}
pub trait IRepoAdapter: Send + Sync {
    fn id(&self) -> &str;
    fn case_insensitive(&self, root: &str, read_only: bool) -> Result<bool>;
    fn checkout_at(&self, path: &str) -> Result<Option<ICheckout>>;
    fn worktrees(&self, checkout: &ICheckout) -> Result<Vec<String>>;
    fn submodules(&self, checkout: &ICheckout) -> Result<Vec<String>>;
    fn env_files(
        &self,
        checkout: &ICheckout,
        options: Option<&IEnvFileRules>,
    ) -> Result<Vec<String>>;
    fn is_ignored(&self, checkout: &ICheckout, rel_path: &str) -> Result<bool>;
    fn ensure_ignored(&self, checkout: &ICheckout, rel_path: &str) -> Result<()>;
}
