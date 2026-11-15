use envden_core::adapters::*;
use envden_testing::repo;
#[test]
fn repo_case_insensitive_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().case_insensitive("", false);
        }),
        "repo.caseInsensitive",
    );
}

#[test]
fn repo_checkout_at_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().checkout_at("");
        }),
        "repo.checkoutAt",
    );
}

#[test]
fn repo_worktrees_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().worktrees(&ICheckout::default());
        }),
        "repo.worktrees",
    );
}

#[test]
fn repo_submodules_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().submodules(&ICheckout::default());
        }),
        "repo.submodules",
    );
}

#[test]
fn repo_env_files_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().env_files(&ICheckout::default(), None);
        }),
        "repo.envFiles",
    );
}

#[test]
fn repo_is_ignored_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().is_ignored(&ICheckout::default(), "");
        }),
        "repo.isIgnored",
    );
}

#[test]
fn repo_ensure_ignored_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = repo::IFakeRepoAdapter::default().ensure_ignored(&ICheckout::default(), "");
        }),
        "repo.ensureIgnored",
    );
}
