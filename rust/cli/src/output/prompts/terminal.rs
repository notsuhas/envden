use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::io::{self, IsTerminal};

pub fn require_terminal(label: &str) -> Result<()> {
    if io::stdin().is_terminal() {
        return Ok(());
    }
    Err(EnvdenError::new(
        ErrorCode::InvalidInput,
        format!(
            "{} needs a terminal. Run this command in your own terminal",
            label.trim_end_matches(['?', ':', '.'])
        ),
    ))
}

pub(super) struct Terminal {
    previous: String,
}

impl Terminal {
    pub(super) fn open(label: &str) -> Result<Self> {
        require_terminal(label)?;
        crossterm::terminal::enable_raw_mode().map_err(failure)?;
        Ok(Self {
            previous: String::new(),
        })
    }

    pub(super) fn render(&mut self, text: &str) -> Result<()> {
        use std::io::Write;
        let mut output = io::stdout();
        let update = redraw(&self.previous, text);
        write!(output, "\x1b[?25l{update}").map_err(failure)?;
        output.flush().map_err(failure)?;
        self.previous = text.into();
        Ok(())
    }

    pub(super) fn key(&self) -> Result<crossterm::event::KeyEvent> {
        loop {
            if let crossterm::event::Event::Key(key) = crossterm::event::read().map_err(failure)? {
                return Ok(key);
            }
        }
    }
}

fn redraw(previous: &str, text: &str) -> String {
    let shared = previous
        .split_inclusive('\n')
        .zip(text.split_inclusive('\n'))
        .take_while(|(old, new)| old == new)
        .map(|(_, line)| line.len())
        .sum::<usize>();
    let remaining = &previous[shared..];
    let lines = remaining.matches('\n').count();
    let movement = if lines > 0 {
        format!("\x1b[{lines}A\r\x1b[J")
    } else {
        String::new()
    };
    format!("{movement}{}", text[shared..].replace('\n', "\r\n"))
}

impl Drop for Terminal {
    fn drop(&mut self) {
        use std::io::Write;
        let _ = write!(io::stdout(), "\x1b[?25h");
        let _ = io::stdout().flush();
        let _ = crossterm::terminal::disable_raw_mode();
    }
}

pub(super) fn failure(error: std::io::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::Internal, "Terminal operation failed", error)
}

pub(super) fn cancelled() -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidInput, "Cancelled")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn input_repaints_do_not_repeat_the_prompt_header() {
        let previous = "│\n◆  Wrong master password. Try again\n│  ▪\n└\n";
        let next = previous.replace("│  ▪", "│  ▪▪");
        assert_eq!(redraw(previous, &next), "\x1b[2A\r\x1b[J│  ▪▪\r\n└\r\n");
        assert_eq!(redraw(previous, previous), "");
    }

    #[test]
    fn nonterminal_errors_are_actionable() {
        if !io::stdin().is_terminal() {
            assert_eq!(
                require_terminal("Master password:").unwrap_err().message,
                "Master password needs a terminal. Run this command in your own terminal"
            );
        }
    }
}
