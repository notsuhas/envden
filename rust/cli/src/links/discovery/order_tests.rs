use super::repos::{IDiscoveryScope, discover_repos};
use envden_core::adapters::ICheckout;
use envden_testing::repo::IFakeRepoAdapter;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

#[test]
fn adds_checkout_and_reports_progress_before_listing_related_checkouts() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::create_dir(temp.path().join(".git")).unwrap();
    let progress = Arc::new(AtomicUsize::new(0));
    let worktree_progress = progress.clone();
    let submodule_progress = progress.clone();
    let repo = IFakeRepoAdapter {
        checkout_at: Some(Box::new(|path| {
            Ok(Some(ICheckout {
                root: path.into(),
                repo_id: "host/repo".into(),
                ..Default::default()
            }))
        })),
        worktrees: Some(Box::new(move |_| {
            assert_eq!(
                worktree_progress.load(Ordering::SeqCst),
                1,
                "progress precedes worktree reads"
            );
            Ok(vec![])
        })),
        submodules: Some(Box::new(move |_| {
            assert_eq!(
                submodule_progress.load(Ordering::SeqCst),
                1,
                "progress precedes submodule reads"
            );
            Ok(vec![])
        })),
        ..Default::default()
    };
    let found = discover_repos(
        &repo,
        &IDiscoveryScope {
            roots: vec![temp.path().into()],
            excluded: vec![],
            home: None,
        },
        &|_| {},
        &|count| progress.store(count, Ordering::SeqCst),
    );
    assert_eq!(found.len(), 1);
}
