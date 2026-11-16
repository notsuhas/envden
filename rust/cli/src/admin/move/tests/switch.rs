use super::*;
use crate::{
    admin::repair::tests::fixture::{Server, fixture},
    client::{IHttpRequest, IHttpResponse},
};
use std::cell::{Cell, RefCell};

struct ILockedDestination {
    inner: Rc<Server>,
    unlocked: Cell<bool>,
    hosts: RefCell<Vec<String>>,
}

impl ITransport for ILockedDestination {
    fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
        self.hosts
            .borrow_mut()
            .push(request.url.host_str().unwrap_or_default().into());
        if request.url.path() == "/v1/entries" && !self.unlocked.get() {
            return Ok(IHttpResponse {
                status: 423,
                location: None,
                body: br#"{"error":"LOCKED"}"#.to_vec(),
            });
        }

        self.inner.fetch(request)
    }
}

#[test]
fn a_locked_switch_logs_in_at_the_destination_only() {
    let (_dir, adapters, server, _token) = fixture();
    let transport = Rc::new(ILockedDestination {
        inner: server,
        unlocked: Cell::new(false),
        hosts: RefCell::new(vec![]),
    });

    let error = switch_server(
        &adapters,
        "https://destination.test",
        transport.clone(),
        None,
    )
    .unwrap_err();
    assert_eq!(error.code, ErrorCode::Locked);

    let logins = RefCell::new(vec![]);
    let unlock = |client: &IClient, _: &[u8; 32]| {
        logins.borrow_mut().push(client.options.address.clone());
        transport.unlocked.set(true);

        Ok(None)
    };
    let error = switch_server(
        &adapters,
        "https://destination.test",
        transport.clone(),
        Some(&unlock),
    )
    .unwrap_err();

    assert_eq!(*logins.borrow(), ["https://destination.test"]);
    assert_eq!(error.code, ErrorCode::InvalidData);
    assert_eq!(error.message, "Server has no verified move to this pin");
    assert!(
        transport
            .hosts
            .borrow()
            .iter()
            .all(|host| host == "destination.test"),
        "{:?}",
        transport.hosts.borrow()
    );
}
