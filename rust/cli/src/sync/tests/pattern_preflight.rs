use super::fixture;
use crate::{
    client::{IHttpRequest, IHttpResponse, ITransport},
    sync::{engine::sync, remote::context::ISyncOptions},
};
use envden_core::errors::{ErrorCode, Result};
use std::{fs, rc::Rc};

struct Offline;

impl ITransport for Offline {
    fn fetch(&self, _: IHttpRequest) -> Result<IHttpResponse> {
        panic!("a refused pattern must stop the sync before any request")
    }
}

#[test]
fn refused_patterns_stop_a_sync_before_it_writes() {
    let (_dir, a, _server, _) = fixture::fixture();
    let state = a.home.join("state/device.json");
    let before = fs::read(&state).unwrap();

    fs::write(
        a.home.join("config.json"),
        r#"{"env-files":{"include":["apps/{*,**}"]}}"#,
    )
    .unwrap();

    let options = ISyncOptions {
        unlock: None,
        now: Rc::new(a.now),
        cwd: None,
        all: true,
        yes: true,
        interactive: false,
        choose: None,
        confirm: None,
        report: None,
    };
    let error = sync(&a, options, Rc::new(Offline), true).unwrap_err();

    assert_eq!(
        (error.code, error.message.as_ref()),
        (ErrorCode::InvalidInput, "Unsupported env file pattern")
    );
    assert_eq!(fs::read(&state).unwrap(), before);
}
