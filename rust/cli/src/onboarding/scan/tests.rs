use super::{ICheckoutOptions, setup_checkouts};
use crate::{
    adapters::create_adapters,
    state::{
        empty_state,
        repository::{load_state, save_state},
    },
};
use envden_core::filesystem::ICanonicalPath;
use envden_core::{
    adapters::{ICheckout, IEnvFileRules, IRepoAdapter},
    errors::Result,
};
use std::{fs, path::Path, sync::Mutex};

struct Repos(Vec<ICheckout>);
impl IRepoAdapter for Repos {
    fn id(&self) -> &str {
        "test"
    }
    fn case_insensitive(&self, _: &str, _: bool) -> Result<bool> {
        Ok(false)
    }
    fn checkout_at(&self, path: &str) -> Result<Option<ICheckout>> {
        Ok(self.0.iter().find(|r| r.root == path).cloned())
    }
    fn worktrees(&self, _: &ICheckout) -> Result<Vec<String>> {
        Ok(vec![])
    }
    fn submodules(&self, _: &ICheckout) -> Result<Vec<String>> {
        Ok(vec![])
    }
    fn env_files(&self, c: &ICheckout, _: Option<&IEnvFileRules>) -> Result<Vec<String>> {
        Ok(if c.repo_id == "host/empty" {
            vec![]
        } else {
            vec![".env".into()]
        })
    }
    fn is_ignored(&self, _: &ICheckout, _: &str) -> Result<bool> {
        Ok(true)
    }
    fn ensure_ignored(&self, _: &ICheckout, _: &str) -> Result<()> {
        Ok(())
    }
}

#[test]
fn differing_worktrees_do_not_abort_unrelated_linking() {
    let root = tempfile::tempdir().unwrap();
    let root = root.path().canonical_path().unwrap();
    let mut adapters = create_adapters(Some(root.join("home")), root.clone(), || 1800000000000);
    let repos: Vec<_> = ["main", "worktree", "unrelated", "empty"]
        .iter()
        .map(|name| ICheckout {
            root: root.join(name).to_string_lossy().into_owned(),
            git_dir: root.join(name).join(".git").to_string_lossy().into_owned(),
            repo_id: format!("host/{}", if *name == "worktree" { "main" } else { name }),
            ..Default::default()
        })
        .collect();
    for (index, repo) in repos.iter().enumerate() {
        fs::create_dir_all(&repo.git_dir).unwrap();
        if index < 3 {
            fs::write(
                Path::new(&repo.root).join(".env"),
                format!("PORT={}", index + 1),
            )
            .unwrap();
        }
    }
    let worktree = repos[1].root.clone();
    adapters.repo = Box::new(Repos(repos));
    let approved = Mutex::new(vec![]);
    let approve = |checkout: &ICheckout| {
        approved.lock().unwrap().push(checkout.repo_id.clone());
        Ok(true)
    };
    let mut state = empty_state("test");
    setup_checkouts(
        &adapters,
        &mut state,
        &ICheckoutOptions {
            scan_root: Some(vec![root]),
            approve: Some(&approve),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(state["links"].as_array().unwrap().len(), 2);
    assert!(
        state["links"]
            .as_array()
            .unwrap()
            .iter()
            .any(|l| l["root"].as_str().unwrap().ends_with("unrelated"))
    );
    assert!(!approved.lock().unwrap().contains(&"host/empty".to_owned()));
    assert_eq!(
        fs::read_to_string(Path::new(&worktree).join(".env")).unwrap(),
        "PORT=2"
    );
}

#[test]
fn checkout_setup_reloads_other_writers_state() {
    let root = tempfile::tempdir().unwrap();
    let adapters = create_adapters(
        Some(root.path().join("home")),
        root.path().to_owned(),
        || 1800000000000,
    );
    let mut stale = empty_state("test");
    let mut current = stale.clone();
    current["aliases"] = serde_json::json!({"host/new":"host/canonical"});
    save_state(&adapters.home, &current, &adapters.now).unwrap();
    setup_checkouts(
        &adapters,
        &mut stale,
        &ICheckoutOptions {
            scan_root: Some(vec![]),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(stale["aliases"], current["aliases"]);
    assert_eq!(
        load_state(&adapters.home).unwrap().unwrap()["aliases"],
        current["aliases"]
    );
}

#[test]
fn vault_repos_reloads_sync_context_before_checkpoint_material() {
    let dir = tempfile::tempdir().unwrap();
    let adapters = create_adapters(Some(dir.path().join("home")), dir.path().into(), || 42);
    let state = serde_json::json!({"checkpoint":"invalid"});
    assert_eq!(
        super::vault_repos(&adapters, &state).unwrap_err().message,
        crate::state::NOT_SET_UP
    );
}

#[test]
fn vault_repos_ignores_empty_checkpoint() {
    let dir = tempfile::tempdir().unwrap();
    let adapters = create_adapters(Some(dir.path().join("home")), dir.path().into(), || 42);
    assert!(
        super::vault_repos(&adapters, &serde_json::json!({"checkpoint":""}))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn worktree_notice_probe() {
    if std::env::var_os("ENVDEN_WORKTREE_NOTICE_PROBE").is_none() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonical_path().unwrap();
    let mut adapters = create_adapters(Some(root.join("home")), root.clone(), || 42);
    let clone = ICheckout {
        root: root.join("clone").to_string_lossy().into_owned(),
        git_dir: root.join("clone/.git").to_string_lossy().into_owned(),
        repo_id: "host/repo".into(),
        ..Default::default()
    };
    let worktree = ICheckout {
        root: root.join("feature").to_string_lossy().into_owned(),
        registered_worktree: Some(true),
        ..clone.clone()
    };
    fs::create_dir_all(&clone.git_dir).unwrap();
    fs::create_dir_all(&worktree.root).unwrap();
    fs::write(
        Path::new(&worktree.root).join(".git"),
        "gitdir: ../clone/.git\n",
    )
    .unwrap();
    fs::write(Path::new(&worktree.root).join(".env"), "A=1\n").unwrap();
    fs::create_dir_all(&adapters.home).unwrap();
    fs::write(
        adapters.home.join("config.json"),
        r#"{"auto-approve-worktrees":true}"#,
    )
    .unwrap();
    let mut state = empty_state("test");
    state["approved"] = serde_json::json!([crate::links::approval::checkout_value(&clone)]);
    save_state(&adapters.home, &state, &adapters.now).unwrap();
    adapters.repo = Box::new(Repos(vec![clone, worktree.clone()]));
    setup_checkouts(
        &adapters,
        &mut state,
        &ICheckoutOptions {
            scan_root: Some(vec![Path::new(&worktree.root).to_owned()]),
            approve: Some(&|_| Ok(true)),
            ..Default::default()
        },
    )
    .unwrap();
}

#[test]
fn automatic_worktree_approval_stays_on_stderr() {
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "onboarding::scan::tests::worktree_notice_probe",
            "--nocapture",
        ])
        .env("ENVDEN_WORKTREE_NOTICE_PROBE", "1")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(!String::from_utf8_lossy(&output.stdout).contains("Approved worktree"));
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("Approved worktree"),
        "stdout={}, stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}
