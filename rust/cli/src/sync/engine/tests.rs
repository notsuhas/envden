use super::*;
#[cfg(test)]
mod cases {
    use super::*;
    struct NeverCall;
    impl ITransport for NeverCall {
        fn fetch(&self, _: crate::client::IHttpRequest) -> Result<crate::client::IHttpResponse> {
            panic!("unconfigured sync must not request the server")
        }
    }
    #[test]
    fn piped_push_requires_yes_before_loading_state() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = crate::adapters::create_adapters(
            Some(dir.path().to_owned()),
            dir.path().to_owned(),
            || 1,
        );
        for (pushing, yes, message) in [
            (
                true,
                false,
                "Without a terminal, push needs --yes to confirm the changes",
            ),
            (true, true, crate::state::NOT_SET_UP),
            (false, false, crate::state::NOT_SET_UP),
        ] {
            let options = ISyncOptions {
                unlock: None,
                now: std::rc::Rc::new(adapters.now),
                cwd: None,
                all: true,
                yes,
                interactive: false,
                choose: None,
                confirm: None,
                report: None,
            };
            assert_eq!(
                sync(&adapters, options, Rc::new(NeverCall), pushing)
                    .unwrap_err()
                    .message,
                message
            );
        }
    }
}
