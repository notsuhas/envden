use super::suggestions::suggest;
use super::validation::{error, validate};
use super::{ICommand, IInvocation, TParseResult};
use serde_json::Value;
use std::collections::BTreeMap;

pub(super) fn finish<'a>(
    command: &'a ICommand,
    parents: &[&ICommand],
    mut positional: Vec<String>,
    options: BTreeMap<String, Value>,
    unknown: Vec<String>,
    help: bool,
) -> TParseResult<'a> {
    if help {
        return TParseResult::Help(command, false);
    }
    if let Some(flag) = unknown.first() {
        let candidates = parents
            .iter()
            .rev()
            .flat_map(|c| &c.options)
            .filter_map(|o| o.long.clone())
            .collect();
        return error(
            command,
            format!(
                "error: unknown option '{flag}'{}",
                if flag.starts_with("--") {
                    suggest(flag, candidates)
                } else {
                    String::new()
                }
            ),
        );
    }
    if !command.commands.is_empty() && !command.action {
        if let Some(name) = positional.first() {
            let mut candidates: Vec<String> = command
                .commands
                .iter()
                .filter(|c| !c.hidden)
                .flat_map(|c| std::iter::once(c.name.clone()).chain(c.aliases.first().cloned()))
                .collect();
            candidates.push("help".into());
            return error(
                command,
                format!(
                    "error: unknown command '{name}'{}",
                    suggest(name, candidates)
                ),
            );
        }
        return TParseResult::Help(command, true);
    }
    for (i, arg) in command.arguments.iter().enumerate() {
        if arg.required && positional.get(i).is_none() {
            return error(
                command,
                format!("error: missing required argument '{}'", arg.name),
            );
        }
    }
    let expected = command.arguments.len();
    if positional.len() > expected && !command.arguments.last().is_some_and(|a| a.variadic) {
        let suffix = if command.path.is_empty() {
            String::new()
        } else {
            format!(" for '{}'", command.name)
        };
        return error(
            command,
            format!(
                "error: too many arguments{suffix}. Expected {expected} argument{} but got {}: {}.",
                if expected == 1 { "" } else { "s" },
                positional.len(),
                positional.join(", ")
            ),
        );
    }
    if let Some(message) = validate(command, &positional, &options) {
        return error(command, message);
    }
    if command.name == "track" && positional.is_empty() {
        positional.push(
            std::env::current_dir()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
        );
    }
    TParseResult::Action(IInvocation {
        command,
        arguments: positional,
        options,
    })
}
