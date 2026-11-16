use super::fixture;
use crate::client::{IHttpRequest, IHttpResponse, ITransport};
use envden_core::errors::Result;
use std::{cell::RefCell, rc::Rc};

struct Observe {
    inner: Rc<dyn ITransport>,
    times: RefCell<Vec<String>>,
}

impl ITransport for Observe {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        if let Some(time) = request.headers.get("Envden-Time") {
            self.times.borrow_mut().push(time.clone());
        }
        self.inner.fetch(request)
    }
}

struct NoUpdates;

impl crate::updates::fetch::IFetcher for NoUpdates {
    fn fetch(
        &self,
        _: &str,
        _: crate::updates::fetch::TRedirect,
        _: std::time::Duration,
    ) -> Result<crate::updates::fetch::IResponse> {
        panic!("refresh does not check updates")
    }
}

#[test]
fn command_notice_freezes_remote_status_and_request_timestamps() {
    let (_dir, adapters, server, _) = fixture::fixture();
    let transport = Rc::new(Observe {
        inner: server,
        times: RefCell::default(),
    });
    let command_time = (adapters.now)() - 123;
    crate::notice::command::command_notice_with_transport(
        &adapters,
        command_time,
        &NoUpdates,
        true,
        None,
        false,
        transport.clone(),
    );

    let remote = crate::notice::remote::read_remote_notice(&adapters.home)
        .unwrap()
        .expect("remote status was refreshed");
    assert_eq!(remote.checked_at, command_time as f64);
    let times = transport.times.borrow();
    assert!(!times.is_empty());
    assert!(times.iter().all(|time| time == &command_time.to_string()));
}
