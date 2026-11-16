use super::terminal::{Terminal, failure};
use crate::output::sanitize_terminal;
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub fn consent(message: &str, initial: bool) -> Result<bool> {
    let _terminal = Terminal::open(message)?;
    cliclack::confirm(sanitize_terminal(message))
        .initial_value(initial)
        .interact()
        .map_err(failure)
}

pub fn choose(
    message: &str,
    options: &[(String, String)],
    initial: Option<&str>,
) -> Result<String> {
    let _terminal = Terminal::open(message)?;
    if options.is_empty() {
        return Err(EnvdenError::new(ErrorCode::InvalidInput, "No choices"));
    }
    let mut prompt = cliclack::select(sanitize_terminal(message));
    for (value, label) in options {
        prompt = prompt.item(value.clone(), sanitize_terminal(label), "");
    }
    if let Some(initial) = initial {
        prompt = prompt.initial_value(initial.to_owned());
    }
    prompt.interact().map_err(failure)
}

pub fn choose_many(message: &str, options: &[(String, String)]) -> Result<Vec<String>> {
    let _terminal = Terminal::open(message)?;
    let mut prompt = cliclack::multiselect(sanitize_terminal(message))
        .required(false)
        .initial_values(options.iter().map(|(value, _)| value.clone()).collect());
    for (value, label) in options {
        prompt = prompt.item(value.clone(), sanitize_terminal(label), "");
    }
    prompt.interact().map_err(failure)
}
