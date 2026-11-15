use super::{
    render::{color, header},
    terminal::{Terminal, cancelled},
};
use crate::output::sanitize_terminal;
use crossterm::event::{KeyCode, KeyModifiers};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub fn consent(message: &str, initial: bool) -> Result<bool> {
    let mut terminal = Terminal::open(message)?;
    let message = sanitize_terminal(message);
    let mut value = initial;
    loop {
        let yes = if value {
            format!("{} Yes", color("32", "●"))
        } else {
            format!("{} {}", color("2", "○"), color("2", "Yes"))
        };
        let no = if !value {
            format!("{} No", color("32", "●"))
        } else {
            format!("{} {}", color("2", "○"), color("2", "No"))
        };
        terminal.render(&format!(
            "{}{}  {yes} {} {no}\n{}\n",
            header(&message, "active"),
            color("36", "│"),
            color("2", "/"),
            color("36", "└")
        ))?;
        let key = terminal.key()?;
        if key.code == KeyCode::Esc
            || (key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c'))
        {
            terminal.render(&format!(
                "{}{}  {}\n{}\n",
                header(&message, "cancel"),
                color("90", "│"),
                color("9;2", if value { "Yes" } else { "No" }),
                color("90", "│")
            ))?;
            return Err(cancelled());
        }
        match key.code {
            KeyCode::Left | KeyCode::Right | KeyCode::Up | KeyCode::Down | KeyCode::Char(' ') => {
                value = !value
            }
            KeyCode::Char('y' | 'Y') => value = true,
            KeyCode::Char('n' | 'N') => value = false,
            KeyCode::Enter => {
                terminal.render(&format!(
                    "{}{}  {}\n",
                    header(&message, "submit"),
                    color("90", "│"),
                    color("2", if value { "Yes" } else { "No" })
                ))?;
                return Ok(value);
            }
            _ => {}
        }
    }
}

pub fn choose(
    message: &str,
    options: &[(String, String)],
    initial: Option<&str>,
) -> Result<String> {
    let choices = run(message, options, initial, false)?;
    choices
        .into_iter()
        .next()
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidInput, "No choices"))
}

pub fn choose_many(message: &str, options: &[(String, String)]) -> Result<Vec<String>> {
    run(message, options, None, true)
}

fn run(
    message: &str,
    options: &[(String, String)],
    initial: Option<&str>,
    multiple: bool,
) -> Result<Vec<String>> {
    let mut terminal = Terminal::open(message)?;
    if options.is_empty() {
        return Ok(Vec::new());
    }
    let message = sanitize_terminal(message);
    let mut cursor = options
        .iter()
        .position(|(v, _)| Some(v.as_str()) == initial)
        .unwrap_or(0);
    let mut selected = vec![multiple; options.len()];
    loop {
        let mut screen = header(&message, "active");
        for (index, (_, label)) in options.iter().enumerate() {
            let symbol = if multiple {
                if selected[index] { "◼" } else { "◻" }
            } else if index == cursor {
                "●"
            } else {
                "○"
            };
            screen.push_str(&format!(
                "{}  {} {}\n",
                color("36", "│"),
                color(if index == cursor { "32" } else { "2" }, symbol),
                sanitize_terminal(label)
            ));
        }
        screen.push_str(&format!("{}\n", color("36", "└")));
        terminal.render(&screen)?;
        let key = terminal.key()?;
        if key.code == KeyCode::Esc
            || (key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c'))
        {
            terminal.render(&format!(
                "{}{}\n",
                header(&message, "cancel"),
                color("90", "│")
            ))?;
            return Err(cancelled());
        }
        match key.code {
            KeyCode::Up | KeyCode::Left | KeyCode::Char('k') => {
                cursor = (cursor + options.len() - 1) % options.len()
            }
            KeyCode::Down | KeyCode::Right | KeyCode::Char('j') => {
                cursor = (cursor + 1) % options.len()
            }
            KeyCode::Char(' ') if multiple => selected[cursor] = !selected[cursor],
            KeyCode::Char('a') if multiple => {
                let all = selected.iter().all(|s| *s);
                selected.fill(!all);
            }
            KeyCode::Enter => {
                if !multiple {
                    selected[cursor] = true;
                }
                let labels = options
                    .iter()
                    .zip(&selected)
                    .filter(|(_, s)| **s)
                    .map(|((_, l), _)| l.as_str())
                    .collect::<Vec<_>>()
                    .join(", ");
                terminal.render(&format!(
                    "{}{}  {}\n",
                    header(&message, "submit"),
                    color("90", "│"),
                    color("2", &labels)
                ))?;
                return Ok(options
                    .iter()
                    .zip(selected)
                    .filter(|(_, s)| *s)
                    .map(|((v, _), _)| v.clone())
                    .collect());
            }
            _ => {}
        }
    }
}
