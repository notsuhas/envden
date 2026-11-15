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
    lines: u16,
}

impl Terminal {
    pub(super) fn open(label: &str) -> Result<Self> {
        require_terminal(label)?;
        crossterm::terminal::enable_raw_mode().map_err(failure)?;
        Ok(Self { lines: 0 })
    }

    pub(super) fn render(&mut self, text: &str) -> Result<()> {
        use std::io::Write;
        let mut output = io::stdout();
        if self.lines > 0 {
            write!(output, "\x1b[{}A\r\x1b[J", self.lines).map_err(failure)?;
        }
        let text = text.replace('\n', "\r\n");
        write!(output, "\x1b[?25l{text}").map_err(failure)?;
        output.flush().map_err(failure)?;
        self.lines = text.matches('\n').count() as u16;
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
    fn nonterminal_errors_are_actionable() {
        if !io::stdin().is_terminal() {
            assert_eq!(
                require_terminal("Master password:").unwrap_err().message,
                "Master password needs a terminal. Run this command in your own terminal"
            );
        }
    }
}
