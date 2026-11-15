use super::validation::{defaults, error};
use super::{ICommand, TParseResult};
use serde_json::Value;
use std::collections::VecDeque;

pub fn parse<'a>(root: &'a ICommand, args: &[String]) -> TParseResult<'a> {
    let mut command = root;
    let mut parents = vec![root];
    let mut tokens: VecDeque<String> = args.iter().cloned().collect();
    let mut positional = Vec::new();
    let mut options = defaults(command);
    let mut unknown = Vec::new();
    let mut passthrough = false;
    let mut help = false;
    while let Some(token) = tokens.pop_front() {
        if !passthrough && token == "--" {
            passthrough = true;
            continue;
        }
        if !passthrough && token.starts_with('-') && token != "-" {
            let (flag, inline) = token
                .split_once('=')
                .map_or((token.as_str(), None), |(a, b)| (a, Some(b.to_string())));
            if flag == "--version" || flag == "-V" {
                return TParseResult::Version;
            }
            if flag == "--help" || flag == "-h" {
                help = true;
                continue;
            }
            let found = parents
                .iter()
                .rev()
                .flat_map(|c| &c.options)
                .find(|o| o.long.as_deref() == Some(flag) || o.short.as_deref() == Some(flag));
            if let Some(option) = found {
                let value = if option.required {
                    match inline.or_else(|| tokens.pop_front()) {
                        Some(value) => Value::String(value),
                        None => {
                            return error(
                                command,
                                format!("error: option '{}' argument missing", option.flags),
                            );
                        }
                    }
                } else if option.optional {
                    inline
                        .or_else(|| {
                            tokens
                                .front()
                                .filter(|s| !s.starts_with('-'))
                                .cloned()
                                .inspect(|_| {
                                    tokens.pop_front();
                                })
                        })
                        .map_or(Value::Bool(true), Value::String)
                } else {
                    if inline.is_some() {
                        unknown.push(token);
                        continue;
                    }
                    Value::Bool(!option.negate)
                };
                if let (Some(choices), Some(value)) = (&option.choices, value.as_str())
                    && !choices.iter().any(|c| c == value)
                {
                    return error(
                        command,
                        format!(
                            "error: option '{}' argument '{}' is invalid. Allowed choices are {}.",
                            option.flags,
                            value,
                            choices.join(", ")
                        ),
                    );
                }
                let value = match super::validation::option_value(command, option, value) {
                    Ok(value) => value,
                    Err(message) => return error(command, message),
                };
                let value = if option.variadic {
                    let mut values = options
                        .get(&option.name)
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    values.push(value);
                    while tokens.front().is_some_and(|t| !t.starts_with('-')) {
                        values.push(Value::String(tokens.pop_front().unwrap()));
                    }
                    Value::Array(values)
                } else {
                    value
                };
                options.insert(option.name.clone(), value);
                continue;
            }
            if !token.starts_with("--") && token.len() > 2 {
                let boundary = token.char_indices().nth(2).map_or(token.len(), |(i, _)| i);
                let short = &token[..boundary];
                if let Some(option) = command
                    .options
                    .iter()
                    .find(|o| o.short.as_deref() == Some(short))
                {
                    let rest = &token[boundary..];
                    tokens.push_front(if option.required || option.optional {
                        rest.into()
                    } else {
                        format!("-{rest}")
                    });
                    tokens.push_front(short.into());
                    continue;
                }
            }
            unknown.push(token);
            continue;
        }
        if positional.is_empty() && !passthrough {
            if let Some(child) = command
                .commands
                .iter()
                .find(|c| c.name == token || c.aliases.contains(&token))
            {
                command = child;
                parents.push(child);
                options.extend(defaults(child));
                continue;
            }
            if token == "help" && !command.commands.is_empty() {
                if let Some(name) = tokens.pop_front() {
                    if let Some(child) = command
                        .commands
                        .iter()
                        .find(|c| c.name == name || c.aliases.contains(&name))
                    {
                        command = child;
                    } else {
                        return error(command, format!("error: unknown command '{name}'"));
                    }
                }
                return TParseResult::Help(command, false);
            }
        }
        positional.push(token);
    }
    super::finish::finish(command, &parents, positional, options, unknown, help)
}
