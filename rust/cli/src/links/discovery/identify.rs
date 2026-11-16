use super::repos::IRepoSkip;
use envden_core::{
    adapters::{ICheckout, IRepoAdapter},
    errors::ErrorCode,
};

pub(super) fn identify(
    repo: &dyn IRepoAdapter,
    path: &str,
    report: &dyn Fn(IRepoSkip),
) -> Option<ICheckout> {
    match repo.checkout_at(path) {
        Ok(Some(checkout)) => Some(checkout),
        Ok(None) => {
            report(IRepoSkip {
                path: path.into(),
                reason: "Repository identity unavailable".into(),
                kind: "identity",
            });
            None
        }
        Err(error) => {
            report(IRepoSkip {
                path: path.into(),
                reason: error.message.into_owned(),
                kind: if error.code == ErrorCode::InvalidInput {
                    "remote"
                } else {
                    "identity"
                },
            });
            None
        }
    }
}
