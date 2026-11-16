use super::terminal::{Terminal, failure};
use crate::output::sanitize_terminal;
use envden_core::errors::Result;

pub fn secret(message: &str, check: impl Fn(&str) -> Option<String> + 'static) -> Result<String> {
    let _terminal = Terminal::open(message)?;
    cliclack::password(sanitize_terminal(message))
        .allow_empty()
        .validate(move |value: &String| validate(value, true, &check))
        .interact()
        .map_err(failure)
}

pub fn input(
    message: &str,
    required: bool,
    initial: Option<&str>,
    check: impl Fn(&str) -> Option<String> + 'static,
) -> Result<String> {
    let _terminal = Terminal::open(message)?;
    cliclack::input(sanitize_terminal(message))
        .required(false)
        .initial_input(initial.unwrap_or_default())
        .validate(move |value: &String| validate(value, required, &check))
        .interact()
        .map_err(failure)
}

fn validate(
    value: &str,
    required: bool,
    check: &impl Fn(&str) -> Option<String>,
) -> std::result::Result<(), String> {
    if value.is_empty() {
        return if required {
            Err("Required".into())
        } else {
            Ok(())
        };
    }
    check(value).map_or(Ok(()), |message| Err(sanitize_terminal(&message)))
}
