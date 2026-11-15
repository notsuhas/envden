use super::{ICommand, TParseResult};
use serde_json::Value;
use std::collections::BTreeMap;

pub(super) fn defaults(command: &ICommand) -> BTreeMap<String, Value> {
    command
        .options
        .iter()
        .filter_map(|o| {
            o.default
                .clone()
                .or(if o.negate {
                    Some(Value::Bool(true))
                } else {
                    None
                })
                .map(|v| (o.name.clone(), v))
        })
        .collect()
}

pub(super) fn error<'a>(command: &ICommand, message: String) -> TParseResult<'a> {
    TParseResult::Error(if command.path.is_empty() {
        crate::output::sanitize_terminal(&message)
    } else {
        message
    })
}

pub(super) fn validate(
    command: &ICommand,
    args: &[String],
    options: &BTreeMap<String, Value>,
) -> Option<String> {
    for option in &command.options {
        if !options.contains_key(&option.name) {
            continue;
        }
        for other in &option.conflicts {
            if options.contains_key(other) {
                let other = command.options.iter().find(|o| o.name == *other)?;
                return Some(format!(
                    "error: option '{}' cannot be used with option '{}'",
                    option.flags, other.flags
                ));
            }
        }
    }
    for (i, arg) in command.arguments.iter().enumerate() {
        if let (Some(choices), Some(value)) = (&arg.choices, args.get(i))
            && !choices.contains(value)
        {
            return Some(format!(
                "error: command-argument value '{}' is invalid for argument '{}'. Allowed choices are {}.",
                value,
                arg.name,
                choices.join(", ")
            ));
        }
    }
    None
}

pub(super) fn option_value(
    command: &ICommand,
    option: &super::IOption,
    value: Value,
) -> Result<Value, String> {
    if option.name != "port" {
        return Ok(value);
    }
    let text = value.as_str().unwrap_or_default();
    if command.name == "serve" {
        let port = text.parse::<u32>().ok().filter(|p| {
            *p <= 65535
                && !text.is_empty()
                && text.len() <= 5
                && text.bytes().all(|b| b.is_ascii_digit())
        });
        return port.map(Value::from).ok_or_else(|| format!("error: option '{}' argument '{}' is invalid. Expected a port from 0 (any free port) to 65535.", option.flags, text));
    }
    if command.name == "ui" {
        return Ok(text
            .trim()
            .parse::<f64>()
            .ok()
            .and_then(serde_json::Number::from_f64)
            .map_or(Value::Null, Value::Number));
    }
    Ok(value)
}
