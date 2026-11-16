use super::repos::{IDiscoveryScope, discover_repos};
use envden_core::adapters::ICheckout;
use envden_core::filesystem::ICanonicalPath;
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

#[test]
fn finishes_submodule_collection_before_descending_from_a_scan_root() {
    use envden_core::errors::{EnvdenError, ErrorCode};
    use std::sync::atomic::AtomicBool;

    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonical_path().unwrap();
    for path in [&root, &root.join("sub"), &root.join("child")] {
        std::fs::create_dir_all(path.join(".git")).unwrap();
    }
    let collected = Arc::new(AtomicBool::new(false));
    let checked = collected.clone();
    let listed = collected.clone();
    let repo = IFakeRepoAdapter {
        checkout_at: Some(Box::new(move |path| {
            if std::path::Path::new(path).ends_with("child") && !checked.load(Ordering::SeqCst) {
                return Err(EnvdenError::new(
                    ErrorCode::Internal,
                    "Submodule collection unfinished",
                ));
            }
            Ok(Some(ICheckout {
                root: path.into(),
                repo_id: "host/repo".into(),
                ..Default::default()
            }))
        })),
        worktrees: Some(Box::new(move |checkout| {
            if std::path::Path::new(&checkout.root).ends_with("sub") {
                listed.store(true, Ordering::SeqCst);
            }
            Ok(vec![])
        })),
        submodules: Some(Box::new(|checkout| {
            Ok(
                if std::path::Path::new(&checkout.root).ends_with("sub")
                    || std::path::Path::new(&checkout.root).ends_with("child")
                {
                    vec![]
                } else {
                    vec!["sub".into()]
                },
            )
        })),
        ..Default::default()
    };
    let found = discover_repos(
        &repo,
        &IDiscoveryScope {
            roots: vec![root],
            excluded: vec![],
            home: None,
        },
        &|_| {},
        &|_| {},
    );
    assert_eq!(found.len(), 3);
}
