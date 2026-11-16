use super::fixture;
use crate::{
    client::{IHttpRequest, IHttpResponse, ITransport},
    history::list::run::file_history,
    sync::remote::context::ISyncOptions,
};
use envden_core::errors::Result;
use std::{path::PathBuf, rc::Rc};
struct Observe {
    server: Rc<fixture::Server>,
    home: PathBuf,
}
impl ITransport for Observe {
    fn fetch(&self, r: IHttpRequest) -> Result<IHttpResponse> {
        assert!(
            self.home.join("state/write.lock").exists(),
            "history must hold state lock during requests"
        );
        self.server.fetch(r)
    }
}
#[test]
fn history_holds_lock_through_network_reads() {
    let (_dir, a, server, _) = fixture::fixture();
    let options = ISyncOptions {
        unlock: None,
        now: std::rc::Rc::new(a.now),
        cwd: None,
        all: true,
        yes: true,
        interactive: false,
        choose: None,
        confirm: None,
        report: None,
    };
    file_history(
        &a,
        options,
        Rc::new(Observe {
            server,
            home: a.home.clone(),
        }),
        None,
    )
    .unwrap();
    assert!(!a.home.join("state/write.lock").exists());
}
