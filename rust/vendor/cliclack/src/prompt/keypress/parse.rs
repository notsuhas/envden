use std::io;

use super::key::{Keypress, Name};
use super::sequence::control_sequence;

const ESCAPE: char = '\x1b';

/// Decodes one keypress like readline's `emitKeys`; `next(true)` may time out after an escape.
pub fn parse(next: &mut dyn FnMut(bool) -> io::Result<Option<char>>) -> io::Result<Keypress> {
    let first = next(false)?.ok_or(io::ErrorKind::UnexpectedEof)?;
    let mut sequence = vec![first];
    let mut ch = Some(first);
    let mut escaped = false;

    if first == ESCAPE {
        escaped = true;
        ch = next(true)?;
        sequence.extend(ch);

        if ch == Some(ESCAPE) {
            ch = next(true)?;
            sequence.extend(ch);
        }
    }

    if escaped && matches!(ch, Some('O' | '[')) {
        return control_sequence(ch == Some('O'), &mut sequence, next);
    }

    let mut key = Keypress::default();

    match ch {
        Some('\r') => key.name = Some(Name::Key("return")),
        Some('\n') => key.name = Some(Name::Key("enter")),
        Some('\t') => key.name = Some(Name::Key("tab")),
        Some('\x08' | '\x7f') => key.name = Some(Name::Key("backspace")),
        Some(ESCAPE) => key.name = Some(Name::Key("escape")),
        Some(' ') => key.name = Some(Name::Key("space")),
        Some(c) if !escaped && c <= '\x1a' => {
            key.name = Some(Name::Char(char::from(c as u8 + b'a' - 1)));
            key.ctrl = true;
        }
        Some(c) if c.is_ascii_alphanumeric() => {
            key.name = Some(Name::Char(c.to_ascii_lowercase()));
            key.shift = c.is_ascii_uppercase();
        }
        None => key.name = Some(Name::Key("escape")),
        Some(_) => {}
    }

    if escaped {
        key.meta = true;
    } else {
        key.text = Some(first);
    }

    Ok(key)
}
