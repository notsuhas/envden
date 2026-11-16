use envden_cli::{
    output::error_exit_code,
    program::{TParseResult, command_tree, parse},
};
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
pub struct ICase {
    pub argv: Vec<String>,
    pub kind: String,
    pub exit: i32,
    #[serde(rename = "errorCode")]
    error_code: Option<String>,
    offending: Option<String>,
    suggestions: Option<Vec<String>>,
    path: Option<Vec<String>>,
    arguments: Option<Vec<String>>,
    options: Option<Value>,
}

pub fn read(json: &str) -> Vec<ICase> {
    serde_json::from_str(json).unwrap()
}

pub fn assert_parser_cases(cases: Vec<ICase>) {
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
