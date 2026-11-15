use crate::{
    client::{IHttpRequest, IHttpResponse, ITransport},
    time::TClock,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{rc::Rc, time::Duration};

struct Bounded {
    inner: Rc<dyn ITransport>,
    now: TClock,
    deadline: u64,
}

impl ITransport for Bounded {
    fn fetch(&self, mut request: IHttpRequest) -> Result<IHttpResponse> {
        let remaining = self.deadline.saturating_sub((self.now)());
        if remaining == 0 {
            return Err(EnvdenError::new(
                ErrorCode::ServerUnreachable,
                "Server request timed out",
            ));
        }
        request.timeout = request.timeout.min(Duration::from_millis(remaining));
        self.inner.fetch(request)
    }
}

pub fn bounded_transport(
    inner: Rc<dyn ITransport>,
    now: TClock,
    deadline: u64,
) -> Rc<dyn ITransport> {
    Rc::new(Bounded {
        inner,
        now,
        deadline,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};
    thread_local! {static NOW:Cell<u64>=const {Cell::new(0)};}
    struct Fetcher(RefCell<Vec<Duration>>);
    impl ITransport for Fetcher {
        fn fetch(&self, request: IHttpRequest) -> Result<IHttpResponse> {
            self.0.borrow_mut().push(request.timeout);
            Ok(IHttpResponse {
                status: 200,
                body: vec![],
                location: None,
            })
        }
    }
    #[test]
    fn requests_share_deadline_and_preserve_shorter_timeouts() {
        NOW.set(0);
        let inner = Rc::new(Fetcher(RefCell::new(vec![])));
        let bounded = bounded_transport(inner.clone(), || NOW.get(), 2000);
        let request = |timeout| IHttpRequest {
            url: "https://server.invalid".parse().unwrap(),
            method: "GET".into(),
            headers: Default::default(),
            body: vec![],
            timeout: Duration::from_millis(timeout),
            allow_redirect_response: false,
        };
        bounded.fetch(request(5000)).unwrap();
        NOW.set(500);
        bounded.fetch(request(5000)).unwrap();
        bounded.fetch(request(100)).unwrap();
        NOW.set(2000);
        assert_eq!(
            bounded.fetch(request(5000)).unwrap_err().code,
            ErrorCode::ServerUnreachable
        );
        assert_eq!(
            *inner.0.borrow(),
            [
                Duration::from_millis(2000),
                Duration::from_millis(1500),
                Duration::from_millis(100)
            ]
        );
    }
}
