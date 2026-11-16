use super::{ICommand, IInvocation, TParseResult, builder::build};
use clap::{ArgMatches, parser::ValueSource};
use serde_json::Value;
use std::collections::BTreeMap;

pub fn parse<'a>(root: &'a ICommand, args: &[String]) -> TParseResult<'a> {
    let (args, control) = super::control::control(root, args);
    if let Some(result) = control {
        return result;
    }
    let matches = match build(root)
        .try_get_matches_from(std::iter::once("envden".to_string()).chain(args.iter().cloned()))
    {
        Ok(matches) => matches,
        Err(error) => return TParseResult::Error(error.to_string()),
    };
    invocation(root, &matches)
}

fn invocation<'a>(mut command: &'a ICommand, mut matches: &ArgMatches) -> TParseResult<'a> {
    while let Some((name, child)) = matches.subcommand() {
        command = command
            .commands
            .iter()
            .find(|c| c.name == name || c.aliases.iter().any(|a| a == name))
            .unwrap();
        matches = child;
    }
    if matches.get_flag("version") {
        return TParseResult::Error("error: unknown option '--version'".into());
    }
    if matches.get_flag("help") {
        return TParseResult::Help(command, false);
    }
    if !command.action {
        return TParseResult::Help(command, true);
    }
    let mut options = BTreeMap::new();
    for option in &command.options {
        if option.name == "help" || option.name == "version" {
            continue;
        }
        let supplied = matches.value_source(&option.name) == Some(ValueSource::CommandLine);
        let value = if !supplied {
            if let Some(default) = &option.default {
                default.clone()
            } else if option.negate {
                Value::Bool(true)
            } else {
                continue;
            }
        } else if option.required || option.optional {
            if option.variadic {
                Value::Array(
                    matches
                        .get_many::<String>(&option.name)
                        .into_iter()
                        .flatten()
                        .map(|v| Value::String(v.clone()))
                        .collect(),
                )
            } else {
                Value::String(
                    matches
                        .get_one::<String>(&option.name)
                        .cloned()
                        .unwrap_or_default(),
                )
            }
        } else {
            Value::Bool(matches.get_flag(&option.name))
        };
        let value = if command.name == "history" && option.name == "restore" {
            match super::restore::parse_version(&value) {
                Ok(version) => Value::from(version),
                Err(error) => return TParseResult::Failure(error),
            }
        } else {
            value
        };
        let value = match super::validation::option_value(command, option, value) {
            Ok(value) => value,
            Err(message) => return TParseResult::Error(message),
        };
        options.insert(option.name.clone(), value);
    }
    let mut arguments: Vec<String> = command
        .arguments
        .iter()
        .flat_map(|arg| {
            matches
                .get_many::<String>(&arg.name)
                .into_iter()
                .flatten()
                .cloned()
        })
        .collect();
    if command.name == "track" && arguments.is_empty() {
        arguments.push(
            std::env::current_dir()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
        );
    }
    TParseResult::Action(IInvocation {
        command,
        arguments,
        options,
    })
}
