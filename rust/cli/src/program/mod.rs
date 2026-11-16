mod builder;
mod help;
mod model;
mod parser;

pub use help::format_help;
pub(super) use model::IOption;
pub use model::{ICommand, IInvocation, TParseResult, command_tree};
pub use parser::parse;
mod dispatch;
pub use dispatch::{DefaultActions, DefaultHooks, ICommandActions, ICommandHooks, dispatch};
mod validation;

mod restore;

mod control;
