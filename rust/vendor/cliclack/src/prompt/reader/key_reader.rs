use std::io;

use zeroize::Zeroizing;

use super::super::keypress::{parse, Keypress};

/// Readline's `escapeCodeTimeout` under Clack.
const ESCAPE_TIMEOUT_MS: u16 = 50;

/// Reads keypresses from stdin, independent of the stream the prompt renders to.
pub struct KeyReader {
    source: platform::Source,
    pending: Zeroizing<Vec<char>>,
    next: usize,
}

impl KeyReader {
    pub fn open() -> io::Result<Self> {
        Ok(Self {
            source: platform::Source::open()?,
            pending: Zeroizing::new(Vec::new()),
            next: 0,
        })
    }

    pub fn read(&mut self) -> io::Result<Keypress> {
        parse(&mut |after_escape| self.next_char(after_escape))
    }

    /// Whether every character of the last terminal read has been decoded.
    pub fn chunk_done(&self) -> bool {
        self.next == self.pending.len()
    }

    fn next_char(&mut self, after_escape: bool) -> io::Result<Option<char>> {
        if self.chunk_done() {
            if after_escape && !self.source.ready(ESCAPE_TIMEOUT_MS)? {
                return Ok(None);
            }

            self.pending.clear();
            self.next = 0;

            while self.pending.is_empty() {
                self.source.fill(&mut self.pending)?;
            }
        }

        self.next += 1;

        Ok(Some(self.pending[self.next - 1]))
    }
}

#[cfg(unix)]
mod platform {
    use std::io;
    use std::os::fd::AsFd;

    use nix::poll::{poll, PollFd, PollFlags};
    use nix::sys::termios::{cfmakeraw, tcgetattr, tcsetattr, SetArg, Termios};
    use zeroize::Zeroizing;

    pub struct Source {
        stdin: io::Stdin,
        original: Termios,
        partial: Zeroizing<Vec<u8>>,
    }

    impl Source {
        pub fn open() -> io::Result<Self> {
            let stdin = io::stdin();
            let original = tcgetattr(&stdin)?;
            let mut raw = original.clone();

            cfmakeraw(&mut raw);
            raw.output_flags = original.output_flags;
            tcsetattr(&stdin, SetArg::TCSADRAIN, &raw)?;

            Ok(Self {
                stdin,
                original,
                partial: Zeroizing::new(Vec::new()),
            })
        }

        pub fn ready(&self, timeout_ms: u16) -> io::Result<bool> {
            let mut fds = [PollFd::new(self.stdin.as_fd(), PollFlags::POLLIN)];

            Ok(poll(&mut fds, timeout_ms)? > 0)
        }

        /// Reads one chunk, decoding UTF-8 like Node's `StringDecoder`.
        pub fn fill(&mut self, chars: &mut Vec<char>) -> io::Result<()> {
            let mut buffer = Zeroizing::new([0u8; 4096]);
            let count = nix::unistd::read(&self.stdin, &mut buffer[..])?;

            if count == 0 {
                return Err(io::ErrorKind::UnexpectedEof.into());
            }

            self.partial.extend_from_slice(&buffer[..count]);

            let complete = self.partial.len() - incomplete_tail(&self.partial);
            let decoded = Zeroizing::new(String::from_utf8_lossy(&self.partial[..complete]).into_owned());

            chars.extend(decoded.chars());
            self.partial.drain(..complete);

            Ok(())
        }
    }

    impl Drop for Source {
        fn drop(&mut self) {
            let _ = tcsetattr(&self.stdin, SetArg::TCSADRAIN, &self.original);
        }
    }

    /// Bytes at the end that start a UTF-8 sequence still waiting for more input.
    fn incomplete_tail(bytes: &[u8]) -> usize {
        for back in 1..=bytes.len().min(3) {
            let width = match bytes[bytes.len() - back] {
                0xc0..=0xdf => 2,
                0xe0..=0xef => 3,
                0xf0..=0xf7 => 4,
                0x80..=0xbf => continue,
                _ => return 0,
            };

            return if width > back { back } else { 0 };
        }

        0
    }
}

#[cfg(not(unix))]
mod platform {
    use std::io;
    use std::time::Duration;

    use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};

    /// Console key events, translated to the VT input Node's libuv produces on Windows.
    pub struct Source;

    impl Source {
        pub fn open() -> io::Result<Self> {
            Ok(Self)
        }

        pub fn ready(&self, timeout_ms: u16) -> io::Result<bool> {
            event::poll(Duration::from_millis(u64::from(timeout_ms)))
        }

        pub fn fill(&mut self, chars: &mut Vec<char>) -> io::Result<()> {
            if let Event::Key(key) = event::read()? {
                if key.kind != KeyEventKind::Release {
                    chars.extend(sequence(key).chars());
                }
            }

            Ok(())
        }
    }

    fn sequence(key: KeyEvent) -> String {
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
        let alt = key.modifiers.contains(KeyModifiers::ALT);
        let shift = key.modifiers.contains(KeyModifiers::SHIFT);
        let modifier = 1 + u8::from(shift) + 2 * u8::from(alt) + 4 * u8::from(ctrl);
        let escape = if alt && !ctrl { "\x1b" } else { "" };
        let csi = |code: &str, end: char| match modifier {
            1 => format!("\x1b[{code}{end}"),
            _ => format!("\x1b[{};{modifier}{end}", if code.is_empty() { "1" } else { code }),
        };

        match key.code {
            KeyCode::Char(c) if ctrl && !alt => control(c).to_string(),
            KeyCode::Char(c) => format!("{escape}{c}"),
            KeyCode::Enter => format!("{escape}\r"),
            KeyCode::Tab => format!("{escape}\t"),
            KeyCode::BackTab => "\x1b[Z".into(),
            KeyCode::Backspace => format!("{escape}\x7f"),
            KeyCode::Esc => "\x1b".into(),
            KeyCode::Up => csi("", 'A'),
            KeyCode::Down => csi("", 'B'),
            KeyCode::Right => csi("", 'C'),
            KeyCode::Left => csi("", 'D'),
            KeyCode::Home => csi("", 'H'),
            KeyCode::End => csi("", 'F'),
            KeyCode::Insert => csi("2", '~'),
            KeyCode::Delete => csi("3", '~'),
            KeyCode::PageUp => csi("5", '~'),
            KeyCode::PageDown => csi("6", '~'),
            _ => String::new(),
        }
    }

    fn control(c: char) -> char {
        match c {
            ' ' | '@' => '\0',
            'a'..='z' | 'A'..='Z' | '['..='_' => char::from(c as u8 & 0x1f),
            _ => c,
        }
    }
}
