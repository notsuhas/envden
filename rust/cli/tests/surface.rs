use envden_cli::{
    output::error_exit_code,
    program::{TParseResult, command_tree, parse},
};
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
struct ICase {
    argv: Vec<String>,
    kind: String,
    exit: i32,
    #[serde(rename = "errorCode")]
    error_code: Option<String>,
    path: Option<Vec<String>>,
    arguments: Option<Vec<String>>,
    options: Option<Value>,
}

#[test]
fn recorded_reference_parser_table() {
    // Captured from the reference commands with actions replaced; binary exits are checked separately.
    let cases: Vec<ICase> = serde_json::from_str(include_str!("fixtures/parser.json")).unwrap();
    let mut failures = Vec::new();
    for case in cases {
        let result = parse(command_tree(), &case.argv);
        let exit = match &result {
            TParseResult::Help(_, true) | TParseResult::Error(_) => 1,
            TParseResult::Failure(error) => error_exit_code(error.code),
            _ => 0,
        };
        let matches = match &result {
            TParseResult::Action(invocation) => {
                case.kind == "action"
                    && case.path.as_ref() == Some(&invocation.command.path)
                    && case.arguments.as_ref().is_some_and(|args| {
                        if invocation.command.name == "track" && args == &["$CWD"] {
                            invocation.arguments
                                == [std::env::current_dir().unwrap().to_string_lossy()]
                        } else {
                            args == &invocation.arguments
                        }
                    })
                    && case.options.as_ref().is_some_and(|expected| {
                        same_values(
                            expected,
                            &serde_json::to_value(&invocation.options).unwrap(),
                        )
                    })
            }
            TParseResult::Help(command, false) => {
                case.kind == "help" && case.path.as_ref() == Some(&command.path)
            }
            TParseResult::Version => case.kind == "version",
            _ => case.kind == "error",
        };
        let error_code = match &result {
            TParseResult::Failure(error) => Some(error.code.as_str()),
            _ => None,
        };
        if exit != case.exit || !matches || error_code != case.error_code.as_deref() {
            failures.push(format!(
                "{:?}: expected {} / {}, got {result:?}",
                case.argv, case.kind, case.exit
            ));
        }
    }
    assert!(
        failures.is_empty(),
        "{} failures:\n{}",
        failures.len(),
        failures.join("\n")
    );
}

fn same_values(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(a), Value::Number(b)) => a.as_f64() == b.as_f64(),
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .all(|(key, value)| b.get(key).is_some_and(|other| same_values(value, other)))
        }
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(a, b)| same_values(a, b))
        }
        _ => a == b,
    }
}

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

#[test]
fn binary_retains_control_and_parser_exit_codes() {
    let cases: Vec<ICase> = serde_json::from_str(include_str!("fixtures/parser.json")).unwrap();
    let home = tempfile::tempdir().unwrap();
    for case in cases.iter().filter(|case| {
        case.kind != "action"
            && (case.argv.len() <= 1
                || case.exit == 2
                || case.argv.iter().any(|arg| arg == "--yes=false")
                || case.argv == ["help", "device", "ls"])
    }) {
        let result = std::process::Command::new(env!("CARGO_BIN_EXE_envden"))
            .args(&case.argv)
            .env("HOME", home.path())
            .env("ENVDEN_HOME", home.path().join("envden"))
            .env("ENVDEN_NO_UPDATE_CHECK", "1")
            .env("ENVDEN_TELEMETRY", "0")
            .env("ENVDEN_NO_REPORT", "1")
            .output()
            .unwrap();
        assert_eq!(result.status.code(), Some(case.exit), "{:?}", case.argv);
    }
}
