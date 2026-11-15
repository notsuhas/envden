use super::actions::{get_unlock_period, set_checkout_placement, set_unlock_period};
use crate::{
    adapters::create_adapters,
    client::{IHttpRequest, IHttpResponse, ITransport},
    state::repository::save_state,
};
use envden_core::errors::{ErrorCode, Result};
use std::rc::Rc;

struct Never;
impl ITransport for Never {
    fn fetch(&self, _: IHttpRequest) -> Result<IHttpResponse> {
        panic!("unexpected network request")
    }
}

#[test]
fn placement_resolves_checkout_and_merges_config() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("repo");
    std::fs::create_dir(&root).unwrap();
    assert!(
        std::process::Command::new("git")
            .args(["init", "-q"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success()
    );
    assert!(
        std::process::Command::new("git")
            .args(["remote", "add", "origin", "https://github.com/example/repo"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success()
    );
    let adapters = create_adapters(Some(dir.path().join("home")), dir.path().into(), || 1);
    let config = set_checkout_placement(&adapters, root.to_str().unwrap(), "copy").unwrap();
    let real = root.canonicalize().unwrap();
    assert_eq!(config["placement"][real.to_str().unwrap()], "copy");
    assert_eq!(super::read_config(&adapters.home).unwrap(), config);
    assert_eq!(
        set_checkout_placement(&adapters, root.to_str().unwrap(), "bad")
            .unwrap_err()
            .message,
        "Expected placement <checkout> link|copy"
    );
    assert_eq!(
        set_checkout_placement(&adapters, dir.path().to_str().unwrap(), "link")
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
}

#[test]
fn unlock_actions_validate_before_network() {
    let dir = tempfile::tempdir().unwrap();
    let adapters = create_adapters(Some(dir.path().join("home")), dir.path().into(), || 1);
    assert_eq!(
        set_unlock_period(&adapters, "2d", "unused", Rc::new(Never))
            .unwrap_err()
            .message,
        "Expected 1d, 7d, 30d or never"
    );
    assert_eq!(
        get_unlock_period(&adapters, Rc::new(Never))
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
    save_state(&adapters.home, &crate::state::empty_state("test"), 1).unwrap();
    assert_eq!(
        set_unlock_period(&adapters, "never", "unused", Rc::new(Never))
            .unwrap_err()
            .code,
        ErrorCode::NotFound
    );
}
