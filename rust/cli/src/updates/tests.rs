use super::{
    cache::IUpdateCache,
    check::check_release,
    download::download_update,
    fetch::{IFetcher, IResponse, TRedirect},
    github::latest_release,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use sha2::{Digest, Sha256};
use std::{cell::RefCell, collections::VecDeque, time::Duration};

struct Fake {
    responses: RefCell<VecDeque<IResponse>>,
    calls: RefCell<Vec<(String, TRedirect, Duration)>>,
}

impl IFetcher for Fake {
    fn fetch(&self, url: &str, redirect: TRedirect, timeout: Duration) -> Result<IResponse> {
        self.calls
            .borrow_mut()
            .push((url.into(), redirect, timeout));
        self.responses
            .borrow_mut()
            .pop_front()
            .ok_or_else(|| EnvdenError::new(ErrorCode::Internal, "Unexpected fetch"))
    }
}

fn response(status: u16, body: &[u8]) -> IResponse {
    IResponse {
        status,
        body: body.into(),
        headers: Default::default(),
    }
}
fn redirect(tag: &str) -> IResponse {
    let mut r = response(302, b"");
    r.headers.insert(
        "location".into(),
        format!("https://github.com/notsuhas/envden/releases/tag/{tag}"),
    );
    r
}
fn fake(responses: Vec<IResponse>) -> Fake {
    Fake {
        responses: RefCell::new(responses.into()),
        calls: RefCell::new(Vec::new()),
    }
}

#[test]
fn public_redirect_and_api_fallback() {
    let fetch = fake(vec![redirect("v1.2.3")]);
    assert_eq!(latest_release(&fetch).unwrap(), "1.2.3");
    assert_eq!(fetch.calls.borrow().len(), 1);
    assert_eq!(fetch.calls.borrow()[0].1, TRedirect::Manual);
    let fetch = fake(vec![
        response(503, b""),
        response(200, br#"{"tag_name":"v2.0.0"}"#),
    ]);
    assert_eq!(latest_release(&fetch).unwrap(), "2.0.0");
    assert_eq!(
        fetch.calls.borrow()[1].0,
        "https://api.github.com/repos/notsuhas/envden/releases/latest"
    );
    assert_eq!(fetch.calls.borrow()[1].1, TRedirect::Error);
}

#[test]
fn malformed_stable_tags() {
    for tag in ["v1.2.3-beta", "1.2.3", "v1.2.3+build"] {
        let fetch = fake(vec![
            redirect(tag),
            response(200, format!(r#"{{"tag_name":"{tag}"}}"#).as_bytes()),
        ]);
        assert_eq!(
            latest_release(&fetch).unwrap_err().message,
            "Invalid release tag"
        );
    }
}

#[test]
fn daily_cache_for_success_and_failure() {
    let fetch = fake(vec![redirect("v1.2.3")]);
    let mut cache = IUpdateCache::default();
    assert_eq!(
        check_release(&mut cache, 100, &fetch, false, &|| 0)["kind"],
        "checked"
    );
    assert_eq!(
        check_release(&mut cache, 101, &fetch, false, &|| 0)["kind"],
        "skipped"
    );
    assert_eq!(fetch.calls.borrow().len(), 1);
    assert_eq!(
        check_release(&mut cache, 86400100, &fetch, false, &|| 0)["kind"],
        "unavailable"
    );
    assert_eq!(
        check_release(&mut cache, 86400101, &fetch, false, &|| 0)["kind"],
        "skipped"
    );
    assert_eq!(
        cache.message.as_deref(),
        Some("Cannot confirm envden is up to date")
    );
}

#[test]
fn verified_download_matrix() {
    for scenario in ["valid", "mismatch", "missing", "equal", "older"] {
        let bytes = b"binary";
        let sums = format!(
            "{:x}  envden-{}",
            Sha256::digest(bytes),
            if scenario == "missing" {
                "darwin-arm64"
            } else {
                "linux-x64"
            }
        );
        let fetch = fake(vec![
            redirect("v1.0.0"),
            response(200, sums.as_bytes()),
            response(
                200,
                if scenario == "mismatch" {
                    b"wrong"
                } else {
                    bytes
                },
            ),
        ]);
        let running = match scenario {
            "equal" => "1.0.0",
            "older" => "2.0.0",
            _ => "0.0.0",
        };
        let result = download_update(&fetch, running, "linux-x64", Duration::from_secs(1800));
        match scenario {
            "valid" => assert_eq!(result.unwrap().unwrap(), bytes),
            "equal" | "older" => {
                assert_eq!(result.unwrap(), None);
                assert_eq!(fetch.calls.borrow().len(), 1);
            }
            "missing" => assert_eq!(
                result.unwrap_err().message,
                "No release build for this platform"
            ),
            _ => assert_eq!(result.unwrap_err().message, "Build checksum mismatch"),
        }
        if scenario == "valid" {
            assert_eq!(fetch.calls.borrow()[2].2, Duration::from_secs(1800));
        }
    }
}

#[test]
fn first_check_cache_key_order_matches_javascript_mutation() {
    let temp = tempfile::tempdir().unwrap();
    let mut cache = IUpdateCache::default();
    check_release(
        &mut cache,
        100,
        &fake(vec![redirect("v1.2.3")]),
        false,
        &|| 0,
    );
    super::cache::save_update_cache(temp.path(), &cache, 100).unwrap();
    assert_eq!(
        std::fs::read_to_string(temp.path().join("state/updates.json")).unwrap(),
        r#"{"latest":"1.2.3","checkedAt":100}"#
    );
    let cache = super::cache::read_update_cache(temp.path());
    super::cache::save_update_cache(temp.path(), &cache, 101).unwrap();
    assert_eq!(
        std::fs::read_to_string(temp.path().join("state/updates.json")).unwrap(),
        r#"{"checkedAt":100,"latest":"1.2.3"}"#
    );
}

mod check;
mod lock;
