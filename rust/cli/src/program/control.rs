use super::{
    ICommand, TParseResult,
    operands::{delimit_operands, known_option, negative_number},
};

pub(super) fn control<'a>(
    root: &'a ICommand,
    args: &[String],
) -> (Vec<String>, Option<TParseResult<'a>>) {
    if args
        .iter()
        .take_while(|token| token.as_str() != "--")
        .any(|token| token == "--version" || token.starts_with("-V"))
    {
        return (Vec::new(), Some(TParseResult::Version));
    }
    let mut command = root;
    let mut normalized = Vec::new();
    let mut help = false;
    let mut short_error = None;
    let mut positional = false;
    let mut operands_only = false;
    let mut unknown = false;
    let mut operands = Vec::new();
    let mut negative = false;
    let mut index = 0;
    while let Some(token) = args.get(index) {
        index += 1;
        if token == "--" && !operands_only {
            operands_only = true;
            continue;
        }
        if operands_only
            && (positional
                || !command
                    .commands
                    .iter()
                    .any(|c| c.name == *token || c.aliases.contains(token)))
            && token != "help"
        {
            normalized.push("--".into());
            normalized.extend_from_slice(&args[index - 1..]);
            break;
        }
        let (flag, inline) = token
            .split_once('=')
            .map_or((token.as_str(), None), |(a, b)| (a, Some(b)));
        if let Some(option) = command
            .options
            .iter()
            .find(|o| o.long.as_deref() == Some(flag) || o.short.as_deref() == Some(flag))
            && !operands_only
            && (option.required || option.optional)
        {
            let value = inline.or_else(|| args.get(index).map(String::as_str));
            if let Some(value) = value {
                if let Some(choices) = &option.choices
                    && !choices.iter().any(|c| c == value)
                {
                    return (
                        normalized,
                        Some(TParseResult::Error(format!(
                            "error: invalid value {value:?} for {} (choose {})",
                            option.flags,
                            choices.join(", ")
                        ))),
                    );
                }
                if command.name == "history"
                    && option.name == "restore"
                    && let Err(error) = super::restore::parse_version(&value.into())
                {
                    return (normalized, Some(TParseResult::Failure(error)));
                }
                if let Err(message) = super::validation::option_value(command, option, value.into())
                {
                    return (normalized, Some(TParseResult::Error(message)));
                }
                normalized.push(format!("{flag}={value}"));
                if inline.is_none() {
                    index += 1;
                }
                if option.variadic && inline.is_none() {
                    while let Some(value) = args
                        .get(index)
                        .filter(|v| !maybe_option(v) || negative_number(v))
                    {
                        normalized.push(format!("{flag}={value}"));
                        index += 1;
                    }
                }
                continue;
            }
            return (
                normalized,
                Some(TParseResult::Error(format!(
                    "error: option '{}' requires a value",
                    option.flags
                ))),
            );
        }
        if !operands_only && (token == "--help" || token == "-h") {
            help = true;
            continue;
        }
        if token.starts_with("-h") {
            short_error = Some(token);
        }
        let leaf_number = command.commands.is_empty() && negative_number(token);
        let operand = !maybe_option(token) || leaf_number;
        if !operand && !known_option(command, token) {
            unknown = true;
        }
        if !help && !positional && operand {
            if token == "help" && !command.commands.is_empty() && !unknown {
                let name = args.get(index).filter(|name| !maybe_option(name));
                let target = name.and_then(|name| {
                    command
                        .commands
                        .iter()
                        .find(|c| c.name == *name || c.aliases.contains(name))
                });
                let stderr = name.is_some() && target.is_none();
                return (
                    normalized,
                    Some(TParseResult::Help(target.unwrap_or(command), stderr)),
                );
            }
            if let Some(child) = command
                .commands
                .iter()
                .find(|c| c.name == *token || c.aliases.contains(token))
            {
                command = child;
            } else {
                positional = true;
            }
        }
        if positional && operand {
            operands.push(normalized.len());
            negative |= leaf_number;
        }
        normalized.push(token.clone());
    }
    if negative {
        normalized = delimit_operands(normalized, &operands);
    }
    let result = if help {
        Some(TParseResult::Help(command, false))
    } else {
        short_error.map(|token| TParseResult::Error(format!("error: unknown option '{token}'")))
    };
    (normalized, result)
}

fn maybe_option(value: &str) -> bool {
    value.len() > 1 && value.starts_with('-')
}
