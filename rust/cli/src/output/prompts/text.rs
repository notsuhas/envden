use super::{
    render::{color, header},
    terminal::{Terminal, cancelled},
};
use crate::output::sanitize_terminal;
use crossterm::event::{KeyCode, KeyModifiers};
use envden_core::errors::Result;

pub fn secret(message: &str, check: impl Fn(&str) -> Option<String>) -> Result<String> {
    ask(message, true, None, true, check)
}

pub fn input(
    message: &str,
    required: bool,
    initial: Option<&str>,
    check: impl Fn(&str) -> Option<String>,
) -> Result<String> {
    ask(message, required, initial, false, check)
}

fn ask(
    message: &str,
    required: bool,
    initial: Option<&str>,
    password: bool,
    check: impl Fn(&str) -> Option<String>,
) -> Result<String> {
    let mut terminal = Terminal::open(message)?;
    let message = sanitize_terminal(message);
    let mut value: Vec<char> = initial.unwrap_or_default().chars().collect();
    let mut cursor = value.len();
    let mut error: Option<String> = None;
    loop {
        let text: String = value.iter().collect();
        let display = if password {
            "▪".repeat(value.len())
        } else {
            text.clone()
        };
        let status = if error.is_some() { "error" } else { "active" };
        let body = if let Some(error) = &error {
            format!("{}  {}", color("33", "└"), color("33", error))
        } else {
            color("36", "└")
        };
        terminal.render(&format!(
            "{}{}  {}\n{body}\n",
            header(&message, status),
            color(if error.is_some() { "33" } else { "36" }, "│"),
            display
        ))?;
        let key = terminal.key()?;
        if key.code == KeyCode::Esc
            || (key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c'))
        {
            terminal.render(&format!(
                "{}{}  {}\n{}\n",
                header(&message, "cancel"),
                color("90", "│"),
                color("9;2", &display),
                color("90", "│")
            ))?;
            return Err(cancelled());
        }
        match key.code {
            KeyCode::Enter => {
                error = if required && text.is_empty() {
                    Some("Required".into())
                } else if !text.is_empty() {
                    check(&text)
                } else {
                    None
                };
                if error.is_none() {
                    terminal.render(&format!(
                        "{}{}{}\n",
                        header(&message, "submit"),
                        color("90", "│"),
                        if display.is_empty() {
                            String::new()
                        } else {
                            format!("  {}", color("2", &display))
                        }
                    ))?;
                    return Ok(text);
                }
            }
            KeyCode::Backspace if cursor > 0 => {
                cursor -= 1;
                value.remove(cursor);
            }
            KeyCode::Delete if cursor < value.len() => {
                value.remove(cursor);
            }
            KeyCode::Left => cursor = cursor.saturating_sub(1),
            KeyCode::Right => cursor = (cursor + 1).min(value.len()),
            KeyCode::Home => cursor = 0,
            KeyCode::End => cursor = value.len(),
            KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                value.clear();
                cursor = 0;
            }
            KeyCode::Char(c) if !key.modifiers.contains(KeyModifiers::CONTROL) => {
                value.insert(cursor, c);
                cursor += 1;
                error = None;
            }
            _ => {}
        }
    }
}
