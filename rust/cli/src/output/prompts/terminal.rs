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
    #[cfg(unix)]
    original: nix::sys::termios::Termios,
}

impl Terminal {
    pub(super) fn open(label: &str) -> Result<Self> {
        require_terminal(label)?;
        #[cfg(unix)]
        {
            use nix::sys::termios::{SetArg, cfmakeraw, tcgetattr, tcsetattr};
            let original = tcgetattr(io::stdin()).map_err(|e| failure(e.into()))?;
            let mut mode = original.clone();
            cfmakeraw(&mut mode);
            mode.output_flags = original.output_flags;
            tcsetattr(io::stdin(), SetArg::TCSANOW, &mode).map_err(|e| failure(e.into()))?;

            Ok(Self { original })
        }
        #[cfg(not(unix))]
        {
            crossterm::terminal::enable_raw_mode().map_err(failure)?;
            Ok(Self {})
        }
    }
}

impl Drop for Terminal {
    fn drop(&mut self) {
        #[cfg(unix)]
        {
            use nix::sys::termios::{SetArg, tcsetattr};
            let _ = tcsetattr(io::stdin(), SetArg::TCSANOW, &self.original);
        }
        #[cfg(not(unix))]
        let _ = crossterm::terminal::disable_raw_mode();
    }
}

pub(super) fn failure(error: io::Error) -> EnvdenError {
    if error.kind() == io::ErrorKind::Interrupted {
        return EnvdenError::new(ErrorCode::InvalidInput, "Cancelled");
    }
    EnvdenError::with_source(ErrorCode::Internal, "Terminal operation failed", error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_keeps_the_input_error_and_exit_code() {
        let error = failure(io::ErrorKind::Interrupted.into());
        assert_eq!(error.code, ErrorCode::InvalidInput);
        assert_eq!(crate::output::error_exit_code(error.code), 2);
    }

    #[test]
    fn terminal_failures_keep_their_cause() {
        let error = failure(io::ErrorKind::BrokenPipe.into());
        assert_eq!(error.code, ErrorCode::Internal);
        assert!(std::error::Error::source(&error).is_some());
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
