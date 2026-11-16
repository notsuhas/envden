use console::{Key, Term};
use std::io::{self, Write};

use super::cursor::StringCursor;
use super::keypress::{Keypress, Name};
use super::reader::KeyReader;
use super::readline::Readline;

pub enum State<T> {
    Active,
    Submit(T),
    Cancel,
    Error(String),
}

#[derive(PartialEq, Eq)]
pub enum Event {
    Key(Key),
}

/// Wraps text to fit the terminal width.
fn wrap(text: &str, width: usize) -> String {
    use textwrap::{core::Word, fill, Options, WordSeparator};

    fill(
        text,
        Options::new(width).word_separator(
            // Workaround to prevent textwrap from splitting words by spaces
            // which breaks the layout of the prompt. Instead, we treat
            // each line as a single word which forces wrapping it hardly
            // at the end of the terminal width.
            WordSeparator::Custom(|line| Box::new(vec![Word::from(line)].into_iter())),
        ),
    )
}

/// A component that renders itself as a prompt and handles user input.
///
/// Two methods are mandatory to implement:
/// [`render()`](PromptInteraction::render) and [`on()`](PromptInteraction::on).
///
/// Interaction with the user starts with [`interact()`](PromptInteraction::interact).
pub trait PromptInteraction<T> {
    /// Renders the prompt according to the interaction state.
    fn render(&mut self, state: &State<T>) -> String;

    /// Handles user input.
    fn on(&mut self, event: &Event) -> State<T>;

    /// Returns the cursor object which is going to be manipulated and modified
    /// during the user interaction.
    fn input(&mut self) -> Option<&mut StringCursor> {
        None
    }

    /// Starts the interaction with the user via stderr.
    fn interact(&mut self) -> io::Result<T> {
        self.interact_on(&mut Term::stderr())
    }

    /// Starts the interaction with the user via the given terminal.
    fn interact_on(&mut self, term: &mut Term) -> io::Result<T> {
        use std::io::IsTerminal;
        if !io::stdin().is_terminal() {
            return Err(io::ErrorKind::NotConnected.into());
        }
        term.hide_cursor()?;
        let result = self.interact_on_prepared(term);
        term.show_cursor()?;
        result
    }

    /// Starts the interaction with the user via the prepared terminal.
    /// Keys are decoded and edited as readline does under Clack; `term` only renders.
    fn interact_on_prepared(&mut self, term: &mut Term) -> io::Result<T> {
        let mut reader = KeyReader::open()?;
        let mut hidden = StringCursor::default();
        let mut readline = match self.input() {
            Some(line) => Readline::new(line),
            None => Readline::new(&mut hidden),
        };
        let mut detached = false;
        let mut state = State::Active;
        let mut prev_frame = String::new();

        loop {
            let frame = self.render(&state);

            if frame != prev_frame {
                let prefix = prev_frame
                    .split_inclusive('\n')
                    .zip(frame.split_inclusive('\n'))
                    .take_while(|(previous, next)| previous == next)
                    .map(|(line, _)| line.len())
                    .sum::<usize>();
                let previous = wrap(&prev_frame[prefix..], term.size().1 as usize);

                term.clear_last_lines(previous.lines().count())?;
                term.write_all(frame[prefix..].as_bytes())?;
                term.flush()?;

                prev_frame = frame;
            }

            match state {
                State::Submit(result) => return Ok(result),
                State::Cancel => return Err(io::ErrorKind::Interrupted.into()),
                _ => {}
            }

            let key = match reader.read() {
                Ok(key) => key,
                Err(e) if e.kind() == io::ErrorKind::Interrupted => {
                    state = State::Cancel;
                    continue;
                }
                Err(e) => return Err(e),
            };

            // After Ctrl-D closes readline, Clack only sees the rest of that read; then Ctrl-C ends it.
            if detached {
                if key.text == Some('\x03') {
                    state = State::Cancel;
                }
                continue;
            }

            if key.text == Some('\x03') {
                state = State::Cancel;
            } else if key.is("escape") {
                state = State::Cancel;

                // WORKAROUND: for the `Esc` key, `Cancel` means "cancellation of cancellation".
                if let State::Cancel = self.on(&Event::Key(Key::Escape)) {
                    state = State::Active;
                }
            } else if key.is("return") {
                state = self.on(&Event::Key(Key::Enter));

                if !matches!(state, State::Submit(_)) {
                    let (line, tracked) = match self.input() {
                        Some(line) => (line, true),
                        None => (&mut hidden, false),
                    };
                    let answer = StringCursor::clone(line);

                    readline.apply(line, &key);
                    readline.write(line, if tracked { answer.chars() } else { &[] });
                }
            } else {
                let tracked = match self.input() {
                    Some(line) => {
                        readline.apply(line, &key);

                        // Clack erases the tab readline inserted.
                        if key.text == Some('\t') {
                            readline.apply(line, &BACKSPACE);
                        }

                        true
                    }
                    None => {
                        readline.apply(&mut hidden, &key);
                        false
                    }
                };

                state = self.on(&Event::Key(prompt_key(&key, tracked)));
            }

            detached = readline.closed() && reader.chunk_done();
        }
    }
}

const BACKSPACE: Keypress = Keypress {
    name: Some(Name::Char('h')),
    ctrl: true,
    meta: false,
    shift: false,
    text: None,
};

/// The key a prompt sees, following Clack's aliases and actions.
fn prompt_key(key: &Keypress, tracked: bool) -> Key {
    let arrow = [
        ("up", "k", Key::ArrowUp),
        ("down", "j", Key::ArrowDown),
        ("left", "h", Key::ArrowLeft),
        ("right", "l", Key::ArrowRight),
    ]
    .into_iter()
    .find(|(action, alias, _)| key.is(action) || (!tracked && key.is(alias)));

    if let Some((_, _, arrow)) = arrow {
        return arrow;
    }

    if tracked {
        return Key::Unknown;
    }

    let answer = key.text.map(|c| c.to_ascii_lowercase());

    match key.name {
        Some(Name::Key("space")) => Key::Char(' '),
        Some(Name::Key("enter")) => Key::Char('\n'),
        Some(Name::Char(c @ ('a' | 'i'))) => Key::Char(c),
        None if key.text == Some('\u{3000}') => Key::Char('\u{3000}'),
        _ if matches!(answer, Some('y' | 'n')) => Key::Char(answer.unwrap_or_default()),
        _ => Key::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prompt::keypress::parse;

    fn key(input: &str) -> Keypress {
        let mut chars = input.chars();

        parse(&mut |_| Ok(chars.next())).unwrap()
    }

    #[test]
    fn prompt_keys_follow_clack_aliases() {
        let cases = [
            ("\x10", false, Key::Unknown),
            ("\x0e", false, Key::Unknown),
            ("\x0b", false, Key::ArrowUp),
            ("\x0c", false, Key::ArrowRight),
            ("K", false, Key::ArrowUp),
            ("\x1b[1;5A", false, Key::ArrowUp),
            ("\x1bOB", false, Key::ArrowDown),
            ("\n", false, Key::Char('\n')),
            ("\x01", false, Key::Char('a')),
            ("\x1bi", false, Key::Char('i')),
            ("Y", false, Key::Char('y')),
            ("\x19", false, Key::Unknown),
            ("k", true, Key::Unknown),
            ("\x1b[A", true, Key::ArrowUp),
        ];

        for (input, tracked, expected) in cases {
            assert_eq!(prompt_key(&key(input), tracked), expected, "{input:?}");
        }
    }
}
