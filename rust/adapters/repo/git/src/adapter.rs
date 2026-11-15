use crate::{case, checkout, discovery, exec, ignore};
use envden_core::{adapters::*, errors::Result};

pub type TResolveHost = Box<dyn Fn(&str) -> Result<String> + Send + Sync>;

#[derive(Default)]
pub struct IGitRepoOptions {
    pub resolve_ssh_host: Option<TResolveHost>,
    pub skip_folders: Vec<String>,
    pub home: Option<String>,
}

pub struct GitRepoAdapter {
    pub(crate) resolve_host: TResolveHost,
    pub(crate) home: Option<String>,
    skip_folders: Vec<String>,
    empty_global: std::sync::Mutex<Option<tempfile::NamedTempFile>>,
}

pub fn create_git_repo_adapter(options: IGitRepoOptions) -> GitRepoAdapter {
    GitRepoAdapter {
        resolve_host: options
            .resolve_ssh_host
            .unwrap_or_else(|| Box::new(crate::remote::resolve_host)),
        home: options.home,
        skip_folders: options.skip_folders,
        empty_global: std::sync::Mutex::new(None),
    }
}

impl GitRepoAdapter {
    pub(crate) fn empty_global(&self) -> Result<std::path::PathBuf> {
        let mut file = self.empty_global.lock().unwrap();
        if file.is_none() {
            *file = Some(tempfile::NamedTempFile::new().map_err(exec::failure)?);
        }
        Ok(file.as_ref().unwrap().path().to_owned())
    }

    pub(crate) fn git(&self, root: &str, args: &[&str], input: Option<&str>) -> Result<String> {
        exec::git(root, args, input, false, self.home.as_deref())
    }
}

impl IRepoAdapter for GitRepoAdapter {
    fn id(&self) -> &str {
        "git"
    }
    fn case_insensitive(&self, root: &str, read_only: bool) -> Result<bool> {
        case::insensitive(root, read_only)
    }
    fn checkout_at(&self, path: &str) -> Result<Option<ICheckout>> {
        checkout::checkout(self, path)
    }
    fn worktrees(&self, checkout: &ICheckout) -> Result<Vec<String>> {
        checkout::worktrees(self, checkout)
    }
    fn submodules(&self, checkout: &ICheckout) -> Result<Vec<String>> {
        checkout::submodules(self, checkout)
    }
    fn env_files(
        &self,
        checkout: &ICheckout,
        rules: Option<&IEnvFileRules>,
    ) -> Result<Vec<String>> {
        let mut rules = rules.cloned().unwrap_or_default();
        let mut skipped = self.skip_folders.clone();
        skipped.extend(rules.extra_skipped.unwrap_or_default());
        rules.extra_skipped = Some(skipped);
        discovery::files(self, checkout, Some(&rules))
    }
    fn is_ignored(&self, checkout: &ICheckout, path: &str) -> Result<bool> {
        ignore::ignored(self, checkout, path)
    }
    fn ensure_ignored(&self, checkout: &ICheckout, path: &str) -> Result<()> {
        ignore::ensure(self, checkout, path)
    }
}
