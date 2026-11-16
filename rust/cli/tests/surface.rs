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
    offending: Option<String>,
    suggestions: Option<Vec<String>>,
    path: Option<Vec<String>>,
    arguments: Option<Vec<String>>,
    options: Option<Value>,
}

#[test]
fn recorded_reference_parser_table() {
    // Captured from the reference commands with actions replaced; binary exits are checked separately.
    let cases: Vec<ICase> = serde_json::from_str(include_str!("fixtures/parser.json")).unwrap();
    assert_parser_cases(cases);
}

fn assert_parser_cases(cases: Vec<ICase>) {
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
            TParseResult::Help(command, stderr) => {
                (case.kind == "help" && case.path.as_ref() == Some(&command.path))
                    || (*stderr && case.kind == "error")
            }
            TParseResult::Version => case.kind == "version",
            _ => case.kind == "error",
        };
        let error_code = match &result {
            TParseResult::Failure(error) => Some(error.code.as_str()),
            _ => None,
        };
        let error_facts_match = case.offending.as_ref().is_none_or(|offending| {
            let TParseResult::Error(message) = &result else {
                return false;
            };
            let suggestions = case.suggestions.as_deref().unwrap_or_default();
            let suffix = match suggestions {
                [] => String::new(),
                [name] => format!("(Did you mean {name}?)"),
                names => format!("(Did you mean one of {}?)", names.join(", ")),
            };

            message.contains(&format!("'{offending}'"))
                && !message.contains("Usage:")
                && !message.contains("tip:")
                && if suffix.is_empty() {
                    !message.contains("Did you mean")
                } else {
                    message.trim_end().ends_with(&suffix)
                }
        });
        if exit != case.exit
            || !matches
            || !error_facts_match
            || error_code != case.error_code.as_deref()
        {
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

#[test]
fn reviewer_edge_argv_table() {
    let cases = serde_json::from_str(r#"[
{"argv":["status","--jsno=1"],"kind":"error","exit":1,"offending":"--jsno=1","suggestions":["--json"]},
{"argv":["status","--jsno=longlong"],"kind":"error","exit":1,"offending":"--jsno=longlong","suggestions":[]},
{"argv":["status","--json=x"],"kind":"error","exit":1,"offending":"--json=x","suggestions":["--json"]},
{"argv":["setup","-xyz"],"kind":"error","exit":1,"offending":"-xyz","suggestions":[]},
{"argv":["not-a-command"],"kind":"error","exit":1,"offending":"not-a-command","suggestions":[]},
{"argv":["status","--unknown-option"],"kind":"error","exit":1,"offending":"--unknown-option","suggestions":[]},
{"argv":["statu"],"kind":"error","exit":1,"offending":"statu","suggestions":["status"]},
{"argv":["STATUS"],"kind":"error","exit":1,"offending":"STATUS","suggestions":[]},
{"argv":["hell"],"kind":"error","exit":1,"offending":"hell","suggestions":["help","shell"]},
{"argv":["device","lss"],"kind":"error","exit":1,"offending":"lss","suggestions":["ls"]},
{"argv":["device","r"],"kind":"error","exit":1,"offending":"r","suggestions":["rm"]},
{"argv":["status","--jsno"],"kind":"error","exit":1,"offending":"--jsno","suggestions":["--json"]},
{"argv":["status","--j"],"kind":"error","exit":1,"offending":"--j","suggestions":[]},
{"argv":["status","--refesh-cache"],"kind":"error","exit":1,"offending":"--refesh-cache","suggestions":[]},
{"argv":["setup","--post-install"],"kind":"error","exit":1,"offending":"--post-install","suggestions":[]},
{"argv":["setup","--telemetri"],"kind":"error","exit":1,"offending":"--telemetri","suggestions":["--telemetry"]},
{"argv":["setup","-Y"],"kind":"error","exit":1,"offending":"-Y","suggestions":[]},
{"argv":["ui","--open"],"kind":"error","exit":1,"offending":"--open","suggestions":["--no-open"]},
{"argv":["server","mov"],"kind":"error","exit":1,"offending":"mov","suggestions":["move"]},
{"argv":["helpme"],"kind":"error","exit":1,"offending":"helpme","suggestions":["help"]},
{"argv":["--help","device"],"kind":"help","exit":0,"path":[]},
{"argv":["device","--help","ls"],"kind":"help","exit":0,"path":["device"]},
{"argv":["--help","device","ls"],"kind":"help","exit":0,"path":[]},
{"argv":["setup","--scan-root=a","b"],"kind":"error","exit":1},
{"argv":["setup","--scan-root","a","b","--name","x"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"scanRoot":["a","b"],"name":"x"}},
{"argv":["setup","--scan-root","a","--scan-root","b"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"scanRoot":["a","b"]}},
{"argv":["setup","--scan-root","a","--","b"],"kind":"error","exit":1},
{"argv":["setup","--scan-root","-x"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"scanRoot":["-x"]}},
{"argv":["setup","--scan-root","a","-"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"scanRoot":["a","-"]}},
{"argv":["setup","--name","--yes"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"name":"--yes"}},
{"argv":["setup","--name","--"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"name":"--"}},
{"argv":["setup","--name="],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"name":""}},
{"argv":["setup","--name","-V"],"kind":"version","exit":0},
{"argv":["setup","--name","--help"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"name":"--help"}},
{"argv":["setup","--name","-h"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"name":"-h"}},
{"argv":["setup","--name","--version"],"kind":"version","exit":0},
{"argv":["server","repair","--without","a","b"],"kind":"action","exit":0,"path":["server","repair"],"arguments":[],"options":{"without":["a","b"]}},
{"argv":["server","repair","--without","a","--finish","b"],"kind":"error","exit":1},
{"argv":["config","a","b","c"],"kind":"action","exit":0,"path":["config"],"arguments":["a","b","c"],"options":{}},
{"argv":["config","a","--","-b"],"kind":"action","exit":0,"path":["config"],"arguments":["a","-b"],"options":{}},
{"argv":["config","--","-a"],"kind":"action","exit":0,"path":["config"],"arguments":["-a"],"options":{}},
{"argv":["config","a","-b"],"kind":"error","exit":1},
{"argv":["untrack","-"],"kind":"action","exit":0,"path":["untrack"],"arguments":["-"],"options":{}},
{"argv":["untrack","--","-x"],"kind":"action","exit":0,"path":["untrack"],"arguments":["-x"],"options":{}},
{"argv":["untrack","--","--"],"kind":"action","exit":0,"path":["untrack"],"arguments":["--"],"options":{}},
{"argv":["ui","--port","-1"],"kind":"action","exit":0,"path":["ui"],"arguments":[],"options":{"open":true,"port":-1}},
{"argv":["ui","--port=0x10"],"kind":"action","exit":0,"path":["ui"],"arguments":[],"options":{"open":true,"port":16}},
{"argv":["ui","--no-open","--port","1"],"kind":"action","exit":0,"path":["ui"],"arguments":[],"options":{"open":false,"port":1}},
{"argv":["ui","--open"],"kind":"error","exit":1},
{"argv":["history","--restore","v2","--all"],"kind":"error","exit":1},
{"argv":["history","--all","--restore","2"],"kind":"error","exit":1},
{"argv":["resolve","--keep-mine","--take-server"],"kind":"error","exit":1},
{"argv":["resolve","--take-server","--keep-mine"],"kind":"error","exit":1},
{"argv":["server","move","--resume","--abort"],"kind":"error","exit":1},
{"argv":["device","foo"],"kind":"error","exit":1},
{"argv":["device","ls","extra"],"kind":"error","exit":1},
{"argv":["vault","kit"],"kind":"help","exit":1,"path":["vault","kit"]},
{"argv":["vault","kit","foo"],"kind":"error","exit":1},
{"argv":["vault","help","kit"],"kind":"help","exit":0,"path":["vault","kit"]},
{"argv":["device","help","ls"],"kind":"help","exit":0,"path":["device","ls"]},
{"argv":["help","device","ls"],"kind":"help","exit":0,"path":["device"]},
{"argv":["help","device","foo"],"kind":"help","exit":0,"path":["device"]},
{"argv":["device","help","foo"],"kind":"help","exit":1,"path":["device"]},
{"argv":["help","--json"],"kind":"help","exit":0,"path":[]},
{"argv":["shell","install","ksh"],"kind":"error","exit":1},
{"argv":["shell","install","zsh","bash"],"kind":"error","exit":1},
{"argv":["shell","install","--","zsh"],"kind":"action","exit":0,"path":["shell","install"],"arguments":["zsh"],"options":{}},
{"argv":["join","--","https://x"],"kind":"action","exit":0,"path":["join"],"arguments":["https://x"],"options":{}},
{"argv":["join","-x"],"kind":"error","exit":1},
{"argv":["track","a","b"],"kind":"error","exit":1},
{"argv":["status","--json","--json"],"kind":"action","exit":0,"path":["status"],"arguments":[],"options":{"json":true}},
{"argv":["status","--refresh-cache=x"],"kind":"error","exit":1},
{"argv":["push","--json","extra"],"kind":"error","exit":1},
{"argv":["setup","--telemetry=bogus"],"kind":"error","exit":1},
{"argv":["setup","--telemetry","on","--telemetry","off"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"telemetry":"off"}},
{"argv":["setup","--agent"],"kind":"error","exit":1},
{"argv":["setup","--shell","zsh","--shell","fish"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"shell":"fish"}},
{"argv":["--yes","setup"],"kind":"error","exit":1},
{"argv":["setup","-y"],"kind":"error","exit":1},
{"argv":["setup","-hV"],"kind":"error","exit":1},
{"argv":["setup","--name","a","-h"],"kind":"help","exit":0,"path":["setup"]},
{"argv":["setup","--name","-Vx"],"kind":"version","exit":0},
{"argv":["setup","--server","--version"],"kind":"version","exit":0},
{"argv":["serve","--port","1e3"],"kind":"error","exit":1},
{"argv":["serve","--port"," 8 "],"kind":"error","exit":1},
{"argv":["ui","--port","08"],"kind":"action","exit":0,"path":["ui"],"arguments":[],"options":{"open":true,"port":8}},
{"argv":["ui","--port",""],"kind":"action","exit":0,"path":["ui"],"arguments":[],"options":{"open":true,"port":0}},
{"argv":["history","--restore",""],"kind":"error","exit":2,"errorCode":"INVALID_INPUT"},
{"argv":["history","--restore","1.5"],"kind":"error","exit":2,"errorCode":"INVALID_INPUT"},
{"argv":["history","--restore","V3"],"kind":"error","exit":2,"errorCode":"INVALID_INPUT"},
{"argv":["alias","a"],"kind":"error","exit":1},
{"argv":["alias","a","b","c"],"kind":"error","exit":1},
{"argv":["rm","--json","x","--yes"],"kind":"action","exit":0,"path":["rm"],"arguments":["x"],"options":{"json":true,"yes":true}},
{"argv":["rm","x","--","--yes"],"kind":"error","exit":1},
{"argv":["device","rename","--","--x"],"kind":"action","exit":0,"path":["device","rename"],"arguments":["--x"],"options":{}},
{"argv":["device","rm","d","--new-kit","--kit-out","f"],"kind":"action","exit":0,"path":["device","rm"],"arguments":["d"],"options":{"newKit":true,"kitOut":"f"}},
{"argv":["vault","password"],"kind":"help","exit":1,"path":["vault","password"]},
{"argv":["vault","password","change","x"],"kind":"error","exit":1},
{"argv":["--","setup"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{}},
{"argv":["setup","--"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{}},
{"argv":["status","--","--json"],"kind":"error","exit":1},
{"argv":["help","help"],"kind":"help","exit":1,"path":[]},
{"argv":["device","help"],"kind":"help","exit":0,"path":["device"]},
{"argv":["device","help","help"],"kind":"help","exit":1,"path":["device"]},
{"argv":["version","--version"],"kind":"version","exit":0},
{"argv":["status","--json","-V"],"kind":"version","exit":0},
{"argv":["status","-Vh"],"kind":"version","exit":0},
{"argv":["setup","--name=-V"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"name":"-V"}},
{"argv":["setup","--name=--version"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"name":"--version"}},
{"argv":["setup","--server=--help"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"server":"--help"}},
{"argv":["setup","--scan-root","a","b","-h"],"kind":"help","exit":0,"path":["setup"]},
{"argv":["config","help"],"kind":"action","exit":0,"path":["config"],"arguments":["help"],"options":{}},
{"argv":["config","--help","x"],"kind":"help","exit":0,"path":["config"]},
{"argv":["config","x","--help"],"kind":"help","exit":0,"path":["config"]},
{"argv":["shell","help","install"],"kind":"help","exit":0,"path":["shell","install"]},
{"argv":["update","--check","--post-install"],"kind":"action","exit":0,"path":["update"],"arguments":[],"options":{"check":true,"postInstall":true}},
{"argv":["serve","--data-dir","--port","1"],"kind":"error","exit":1},
{"argv":["setup","--exclude-root"],"kind":"error","exit":1},
{"argv":["setup","--scan-root","--yes"],"kind":"action","exit":0,"path":["setup"],"arguments":[],"options":{"scanRoot":["--yes"]}},
{"argv":["server","repair","--without=a","b"],"kind":"error","exit":1}
]"#).unwrap();
    assert_parser_cases(cases);
}
