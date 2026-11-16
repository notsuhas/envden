use crate::time::TClock;
use envden_core::adapters::{
    IKeychainAdapter, INetworkAdapter, IPlacementAdapter, IRepoAdapter, IShellAdapter,
    TPlacementMode,
};
use std::path::{Path, PathBuf};

pub struct IAdapters {
    pub home: PathBuf,
    pub user_home: PathBuf,
    pub executable: PathBuf,
    pub hostname: String,
    pub now: TClock,
    pub keychain: Box<dyn IKeychainAdapter>,
    pub repo: Box<dyn IRepoAdapter>,
    pub network: Box<dyn INetworkAdapter>,
}

pub fn create_adapters(home: Option<PathBuf>, user_home: PathBuf, now: TClock) -> IAdapters {
    let home = home
        .or_else(|| std::env::var_os("ENVDEN_HOME").map(PathBuf::from))
        .unwrap_or_else(|| user_home.join(".envden"));
    let home = real_location(&home);
    IAdapters {
        hostname: hostname::get()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default(),
        keychain: Box::new(envden_adapter_keychain_file::create_file_keychain_adapter(
            &home,
        )),
        repo: Box::new(envden_adapter_repo_git::create_git_repo_adapter(
            Default::default(),
        )),
        network: Box::new(envden_adapter_network_tailscale::create_tailscale_network_adapter(None)),
        home,
        user_home,
        executable: std::env::current_exe().unwrap_or_default(),
        now,
    }
}

impl IAdapters {
    pub fn placement(&self, mode: TPlacementMode, root: &Path) -> Box<dyn IPlacementAdapter> {
        let clock = self.now;
        Box::new(envden_adapter_placement_fs::create_fs_placement_adapter(
            mode,
            root,
            Some(&self.home.join("conflicts")),
            move || clock() as f64,
        ))
    }

    pub fn shell(&self, shell: envden_adapter_shell_rc::TShell) -> Box<dyn IShellAdapter> {
        Box::new(envden_adapter_shell_rc::create_rc_shell_adapter(
            shell,
            &self.user_home,
            Some(&self.home),
            Some(&self.home.join("conflicts")),
            None,
        ))
    }

    pub fn prune_placement_backups(&self, now: u64) -> envden_core::errors::Result<()> {
        envden_adapter_placement_fs::prune_backups(
            &self.home.join("conflicts"),
            now as f64,
            Some(30.0),
        )
    }
}

fn real_location(path: &Path) -> PathBuf {
    let absolute = std::path::absolute(path).unwrap_or_else(|_| path.to_owned());
    let absolute = crate::links::takeover::sibling::normalize(&absolute);
    let path = absolute.as_path();
    if let Ok(real) = path.canonicalize() {
        return real;
    }
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) if parent != path => real_location(parent).join(name),
        _ => path.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_relative_home_resolves_from_the_working_directory() {
        let relative = PathBuf::from(format!(".envden-missing-{}/nested", uuid::Uuid::new_v4()));
        let temp = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(relative.clone()), temp.path().into(), || 42);
        let cwd = std::env::current_dir().unwrap().canonicalize().unwrap();
        assert_eq!(adapters.home, cwd.join(relative));
    }
}
