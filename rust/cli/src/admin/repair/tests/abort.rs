use super::super::context::repair_context;
use super::fixture::fixture;

#[test]
fn abort_move_empty_pin_reports_missing_pin_before_discard() {
    let (_dir, adapters, server, token) = fixture();
    std::fs::write(adapters.home.join("state/move-pin"), "").unwrap();
    let (context, _) = repair_context(&adapters, &token, server.clone()).unwrap();
    let error = crate::admin::r#move::abort::abort_move(
        &context,
        &adapters.home.join("state"),
        Some("https://destination.test"),
    )
    .unwrap_err();
    assert_eq!(error.code, envden_core::errors::ErrorCode::InvalidData);
    assert_eq!(error.message, "Missing move pin");
    assert!(
        !server
            .requests
            .borrow()
            .iter()
            .any(|path| path.starts_with("/v1/move/"))
    );
}

#[test]
fn abort_move_holds_state_lock_during_history_requests() {
    struct LockedTransport {
        inner: std::rc::Rc<super::fixture::Server>,
        lock: std::path::PathBuf,
    }
    impl crate::client::ITransport for LockedTransport {
        fn fetch(
            &self,
            request: crate::client::IHttpRequest,
        ) -> envden_core::errors::Result<crate::client::IHttpResponse> {
            assert!(
                self.lock.is_dir(),
                "abort must acquire the state lock before requests"
            );
            self.inner.fetch(request)
        }
    }
    let (_dir, adapters, server, token) = fixture();
    let transport = std::rc::Rc::new(LockedTransport {
        inner: server,
        lock: adapters.home.join("state/write.lock"),
    });
    let (context, _) = repair_context(&adapters, &token, transport).unwrap();
    let error = crate::admin::r#move::abort::abort_move(
        &context,
        &adapters.home.join("state"),
        Some("https://destination.test"),
    )
    .unwrap_err();
    assert_eq!(error.message, "Missing move pin");
    assert!(!adapters.home.join("state/write.lock").exists());
}
