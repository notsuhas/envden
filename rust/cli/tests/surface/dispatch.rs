use envden_cli::program::{TParseResult, command_tree, parse};

#[test]
fn dispatch_preserves_notice_action_and_telemetry_order() {
    use envden_cli::{
        adapters::{IAdapters, create_adapters},
        program::{ICommandActions, ICommandHooks, IInvocation, dispatch},
    };
    use envden_core::errors::{EnvdenError, ErrorCode, Result};
    use std::cell::RefCell;

    struct Recording<'a>(&'a RefCell<Vec<&'static str>>);
    impl ICommandActions for Recording<'_> {
        fn run(&self, _: &IInvocation<'_>, _: &IAdapters) -> Result<()> {
            self.0.borrow_mut().push("action");
            Err(EnvdenError::new(ErrorCode::Conflict, "Conflict"))
        }
    }
    impl ICommandHooks for Recording<'_> {
        fn notice(&self, _: &IInvocation<'_>, _: &IAdapters, now: u64) -> Result<()> {
            assert_eq!(now, 42);
            self.0.borrow_mut().push("notice");
            Err(EnvdenError::new(ErrorCode::Internal, "Notice unavailable"))
        }
        fn report(&self, _: &IInvocation<'_>, _: &IAdapters, result: &Result<()>) {
            assert_eq!(result.as_ref().unwrap_err().code, ErrorCode::Conflict);
            self.0.borrow_mut().push("telemetry");
        }
    }
    let home = tempfile::tempdir().unwrap();
    let adapters = create_adapters(Some(home.path().join("envden")), home.path().into(), || 42);
    for (args, expected) in [
        (vec!["push"], vec!["notice", "action", "telemetry"]),
        (vec!["push", "--json"], vec!["action", "telemetry"]),
        (vec!["status", "--refresh-cache"], vec!["action"]),
    ] {
        let TParseResult::Action(invocation) = parse(
            command_tree(),
            &args.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
        ) else {
            panic!("action expected");
        };
        let events = RefCell::new(Vec::new());
        let recorder = Recording(&events);
        let error = dispatch(&invocation, &adapters, &recorder, &recorder).unwrap_err();
        assert_eq!(error.code, ErrorCode::Conflict);
        assert_eq!(*events.borrow(), expected);
    }
}
