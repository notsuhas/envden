use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::OnceLock;

#[derive(Debug, Deserialize)]
pub struct ICommand {
    pub name: String,
    pub path: Vec<String>,
    pub aliases: Vec<String>,
    pub description: String,
    pub action: bool,
    pub hidden: bool,
    pub options: Vec<IOption>,
    pub arguments: Vec<IArgument>,
    pub commands: Vec<ICommand>,
}

#[derive(Debug, Deserialize)]
pub struct IOption {
    pub flags: String,
    pub short: Option<String>,
    pub long: Option<String>,
    pub name: String,
    pub required: bool,
    pub optional: bool,
    pub variadic: bool,
    pub negate: bool,
    pub conflicts: Vec<String>,
    pub default: Option<Value>,
    pub choices: Option<Vec<String>>,
    pub description: String,
    pub hidden: bool,
}

#[derive(Debug, Deserialize)]
pub struct IArgument {
    pub name: String,
    pub required: bool,
    pub variadic: bool,
    pub default: Option<Value>,
    pub choices: Option<Vec<String>>,
    pub description: String,
}

#[derive(Debug)]
pub struct IInvocation<'a> {
    pub command: &'a ICommand,
    pub arguments: Vec<String>,
    pub options: BTreeMap<String, Value>,
}

#[derive(Debug)]
pub enum TParseResult<'a> {
    Help(&'a ICommand, bool),
    Version,
    Action(IInvocation<'a>),
    Error(String),
    Failure(envden_core::errors::EnvdenError),
}

pub fn command_tree() -> &'static ICommand {
    static TREE: OnceLock<ICommand> = OnceLock::new();

    TREE.get_or_init(|| {
        serde_json::from_str(include_str!("commands.json")).expect("command metadata")
    })
}
