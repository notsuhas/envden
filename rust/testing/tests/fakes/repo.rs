use envden_core::adapters::*;
use envden_testing::repo;
#[test]
fn repo_case_insensitive_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().case_insensitive("", false);
        })
        .is_err()
    );
}

#[test]
fn repo_checkout_at_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().checkout_at("");
        })
        .is_err()
    );
}

#[test]
fn repo_worktrees_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().worktrees(&ICheckout::default());
        })
        .is_err()
    );
}

#[test]
fn repo_submodules_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().submodules(&ICheckout::default());
        })
        .is_err()
    );
}

#[test]
fn repo_env_files_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().env_files(&ICheckout::default(), None);
        })
        .is_err()
    );
}

#[test]
fn repo_is_ignored_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().is_ignored(&ICheckout::default(), "");
        })
        .is_err()
    );
}

#[test]
fn repo_ensure_ignored_is_strict() {
    assert!(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().ensure_ignored(&ICheckout::default(), "");
        })
        .is_err()
    );
}
