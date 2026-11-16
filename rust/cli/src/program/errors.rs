use super::{ICommand, suggestions::suggestions};
use clap::error::{ContextKind, ContextValue, ErrorKind};

pub(super) fn render(root: &ICommand, args: &[String], error: &clap::Error) -> String {
    let commands = command_path(root, args);
    let command = commands.last().copied().unwrap_or(root);
    let invalid = error
        .get(ContextKind::InvalidSubcommand)
        .or_else(|| error.get(ContextKind::InvalidArg));
    if let Some(ContextValue::String(invalid)) = invalid {
        let token = args.iter().find(|token| {
            token.as_str() == invalid
                || token
                    .split_once('=')
                    .is_some_and(|(flag, _)| flag == invalid)
                || (invalid.len() == 2 && invalid.starts_with('-') && token.starts_with(invalid))
        });
        let unexpected_flag_value = error.kind() == ErrorKind::TooManyValues
            && token.is_some_and(|token| token.contains('='))
            && command.options.iter().any(|option| {
                option.long.as_deref() == Some(invalid) && !option.required && !option.optional
            });
        let delimiter = args
            .iter()
            .position(|token| token == "--")
            .unwrap_or(args.len());
        let operand = args[delimiter..]
            .iter()
            .skip(1)
            .any(|token| token == invalid)
            && !args[..delimiter].iter().any(|token| token == invalid);
        if (error.kind() == ErrorKind::UnknownArgument || unexpected_flag_value)
            && invalid.starts_with('-')
            && !operand
        {
            let invalid = token.map_or(invalid.as_str(), String::as_str);
            let candidates = if invalid.starts_with("--") {
                commands
                    .iter()
                    .flat_map(|command| &command.options)
                    .filter(|option| !option.hidden)
                    .filter_map(|option| option.long.as_deref())
                    .collect()
            } else {
                Vec::new()
            };

            return format!(
                "error: unknown option '{invalid}'{}",
                suggestions(invalid, candidates)
            );
        }
        if matches!(
            error.kind(),
            ErrorKind::InvalidSubcommand | ErrorKind::UnknownArgument
        ) && !command.commands.is_empty()
            && command.arguments.is_empty()
        {
            let mut candidates: Vec<_> = command
                .commands
                .iter()
                .filter(|child| !child.hidden)
                .flat_map(|child| {
                    std::iter::once(child.name.as_str())
                        .chain(child.aliases.first().map(String::as_str))
                })
                .collect();
            candidates.push("help");

            return format!(
                "error: unknown command '{invalid}'{}",
                suggestions(invalid, candidates)
            );
        }
    }

    error
        .to_string()
        .split("\n\n")
        .next()
        .unwrap_or_default()
        .trim_end()
        .to_string()
}

fn command_path<'a>(root: &'a ICommand, args: &[String]) -> Vec<&'a ICommand> {
    let mut command = root;
    let mut commands = vec![root];
    for token in args {
        let flag = token
            .split_once('=')
            .map_or(token.as_str(), |(flag, _)| flag);
        if command.options.iter().any(|option| {
            option.long.as_deref() == Some(flag) || option.short.as_deref() == Some(flag)
        }) {
            continue;
        }
        let Some(child) = command
            .commands
            .iter()
            .find(|child| child.name == *token || child.aliases.contains(token))
        else {
            break;
        };
        command = child;
        commands.push(child);
    }

    commands
}
