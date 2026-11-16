use super::{ICommand, IOption};
use clap::{Arg, ArgAction, Command, builder::PossibleValuesParser};

pub(super) fn build(command: &ICommand) -> Command {
    let mut result = Command::new(command.name.clone())
        .bin_name(
            std::iter::once("envden".to_string())
                .chain(command.path.clone())
                .collect::<Vec<_>>()
                .join(" "),
        )
        .about(command.description.clone())
        .hide(command.hidden)
        .aliases(command.aliases.clone())
        .disable_help_flag(true)
        .disable_version_flag(true)
        .disable_help_subcommand(true)
        .args_override_self(true)
        .subcommand_precedence_over_arg(true);
    for option in &command.options {
        if option.name != "help" && option.name != "version" {
            result = result.arg(option_arg(option));
        }
    }
    result = result.arg(
        Arg::new("help")
            .long("help")
            .short('h')
            .action(ArgAction::SetTrue)
            .help("Display help"),
    );
    if command.path.is_empty() {
        result = result.arg(
            Arg::new("version")
                .long("version")
                .short('V')
                .global(true)
                .action(ArgAction::SetTrue)
                .help("Print version"),
        );
    }
    for (index, argument) in command.arguments.iter().enumerate() {
        let mut arg = Arg::new(argument.name.clone())
            .index(index + 1)
            .required(argument.required)
            .help(argument.description.clone());
        if argument.variadic {
            arg = arg.num_args(0..);
        }
        if let Some(choices) = &argument.choices {
            arg = arg.value_parser(PossibleValuesParser::new(choices.clone()));
        }
        result = result.arg(arg);
    }
    for child in &command.commands {
        result = result.subcommand(build(child));
    }
    result
}

fn option_arg(option: &IOption) -> Arg {
    let mut arg = Arg::new(option.name.clone())
        .help(option.description.clone())
        .hide(option.hidden);
    if let Some(long) = &option.long {
        arg = arg.long(long.trim_start_matches('-').to_string());
    }
    if let Some(short) = &option.short {
        arg = arg.short(short.chars().nth(1).unwrap());
    }
    if option.required || option.optional {
        arg = arg
            .action(if option.variadic {
                ArgAction::Append
            } else {
                ArgAction::Set
            })
            .allow_hyphen_values(!option.variadic);
        if option.variadic {
            arg = arg.num_args(1..);
        }
        if option.optional {
            arg = arg.num_args(0..=1);
        }
        if let Some(choices) = &option.choices {
            arg = arg.value_parser(PossibleValuesParser::new(choices.clone()));
        }
    } else {
        arg = arg.action(if option.negate {
            ArgAction::SetFalse
        } else {
            ArgAction::SetTrue
        });
    }
    for conflict in &option.conflicts {
        arg = arg.conflicts_with(conflict.clone());
    }
    arg
}
