mod help;
mod model;
mod parser;
mod suggestions;

pub use help::format_help;
pub use model::{IArgument, ICommand, IInvocation, IOption, TParseResult, command_tree};
pub use parser::parse;
mod dispatch;
pub use dispatch::{DefaultActions, DefaultHooks, ICommandActions, ICommandHooks, dispatch};
mod validation;
