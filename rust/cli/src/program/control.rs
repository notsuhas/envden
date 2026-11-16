use super::{ICommand, TParseResult};

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
    let mut index = 0;
    while let Some(token) = args.get(index) {
        index += 1;
        if token == "--" {
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
                if option.variadic {
                    while let Some(value) = args.get(index).filter(|v| !v.starts_with('-')) {
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
        if token == "--help" || token == "-h" {
            help = true;
            continue;
        }
        if token.starts_with("-h") {
            short_error = Some(token);
        }
        if !positional && !token.starts_with('-') {
            if token == "help" && !command.commands.is_empty() {
                let target = match args.get(index) {
                    None => command,
                    Some(name) => match command
                        .commands
                        .iter()
                        .find(|c| c.name == *name || c.aliases.contains(name))
                    {
                        Some(child) => child,
                        None => {
                            return (
                                normalized,
                                Some(TParseResult::Error(format!(
                                    "error: unknown command '{name}'"
                                ))),
                            );
                        }
                    },
                };
                return (normalized, Some(TParseResult::Help(target, false)));
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
        normalized.push(token.clone());
    }
    let result = if help {
        Some(TParseResult::Help(command, false))
    } else {
        short_error.map(|token| TParseResult::Error(format!("error: unknown option '{token}'")))
    };
    (normalized, result)
}
