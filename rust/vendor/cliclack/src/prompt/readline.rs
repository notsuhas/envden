use zeroize::Zeroizing;

use super::cursor::StringCursor;
use super::keypress::{Keypress, Name};

type TText = Zeroizing<Vec<char>>;

const KILL_RING_SIZE: usize = 32;
const UNDO_SIZE: usize = 2048;
const HISTORY_SIZE: usize = 30;

/// Line editing as Node's readline `Interface` applies it under Clack.
pub struct Readline {
    kill_ring: Vec<TText>,
    kill_cursor: usize,
    yanking: bool,
    undo: Vec<StringCursor>,
    redo: Vec<StringCursor>,
    history: Vec<TText>,
    history_index: isize,
    substring_search: Option<TText>,
    closed: bool,
}

impl Readline {
    /// Starts like Clack, which writes the initial text into an empty line.
    pub fn new(line: &mut StringCursor) -> Self {
        let mut readline = Self {
            kill_ring: Vec::new(),
            kill_cursor: 0,
            yanking: false,
            undo: Vec::new(),
            redo: Vec::new(),
            history: Vec::new(),
            history_index: -1,
            substring_search: None,
            closed: false,
        };
        let initial = text(line.chars());

        line.set(&[], 0);
        readline.write(line, &initial);

        readline
    }

    /// Whether Ctrl-D on an empty line closed the interface.
    pub fn closed(&self) -> bool {
        self.closed
    }

    /// Mirrors `rl.write(text)`, which Clack uses to restore a rejected answer.
    pub fn write(&mut self, line: &mut StringCursor, value: &[char]) {
        if self.closed {
            return;
        }

        self.prelude(line, &Keypress::default());

        if !value.is_empty() {
            self.insert(line, value);
        }
    }

    /// Mirrors readline's `_ttyWrite` for one keypress.
    pub fn apply(&mut self, line: &mut StringCursor, key: &Keypress) {
        if self.closed {
            return;
        }

        self.prelude(line, key);

        match key.text {
            Some('\x1f') => return self.undo(line),
            Some('\x1e') => return self.redo(line),
            _ => {}
        }

        if key.is("escape") {
            return;
        }

        if key.ctrl && key.shift {
            if key.is("backspace") {
                self.delete_line_left(line);
            } else if key.is("delete") {
                self.delete_line_right(line);
            }
        } else if key.ctrl {
            self.control(line, key);
        } else if key.meta {
            self.meta(line, key);
        } else {
            self.plain(line, key);
        }
    }

    fn prelude(&mut self, line: &StringCursor, key: &Keypress) {
        if !(key.meta && key.is("y")) {
            self.yanking = false;
        }

        let vertical = (key.is("up") || key.is("down")) && !key.ctrl && !key.meta && !key.shift;

        if vertical {
            if self.substring_search.is_none() {
                self.substring_search = Some(text(&line.chars()[..line.position()]));
            }
        } else if self.substring_search.take().is_some()
            && self.history.len() as isize == self.history_index
        {
            self.history_index = -1;
        }
    }

    fn control(&mut self, line: &mut StringCursor, key: &Keypress) {
        let empty = line.position() == 0 && line.chars().is_empty();

        match key.name {
            Some(Name::Char('h')) => self.delete_left(line),
            Some(Name::Char('d')) if empty => self.closed = true,
            Some(Name::Char('d')) => self.delete_right(line),
            Some(Name::Char('u')) => self.delete_line_left(line),
            Some(Name::Char('k')) => self.delete_line_right(line),
            Some(Name::Char('a')) => line.move_to(0),
            Some(Name::Char('e')) => line.move_to(usize::MAX),
            Some(Name::Char('b')) => line.move_left(),
            Some(Name::Char('f')) => line.move_right(),
            Some(Name::Char('n')) => self.history_next(line),
            Some(Name::Char('p')) => self.history_prev(line),
            Some(Name::Char('y')) => self.yank(line),
            Some(Name::Char('w') | Name::Key("backspace")) => self.delete_word_left(line),
            Some(Name::Key("delete")) => self.delete_word_right(line),
            Some(Name::Key("left")) => self.word_left(line),
            Some(Name::Key("right")) => self.word_right(line),
            _ => {}
        }
    }

    fn meta(&mut self, line: &mut StringCursor, key: &Keypress) {
        match key.name {
            Some(Name::Char('b')) => self.word_left(line),
            Some(Name::Char('f')) => self.word_right(line),
            Some(Name::Char('d') | Name::Key("delete")) => self.delete_word_right(line),
            Some(Name::Key("backspace")) => self.delete_word_left(line),
            Some(Name::Char('y')) => self.yank_pop(line),
            _ => {}
        }
    }

    // Clack's `rl.write` after a rejected Enter clears readline's CRLF guard, so it is omitted.
    fn plain(&mut self, line: &mut StringCursor, key: &Keypress) {
        match key.name {
            Some(Name::Key("return" | "enter")) => self.line(line),
            Some(Name::Key("backspace")) => self.delete_left(line),
            Some(Name::Key("delete")) => self.delete_right(line),
            Some(Name::Key("left")) => line.move_left(),
            Some(Name::Key("right")) => line.move_right(),
            Some(Name::Key("home")) => line.move_to(0),
            Some(Name::Key("end")) => line.move_to(usize::MAX),
            Some(Name::Key("up")) => self.history_prev(line),
            Some(Name::Key("down")) => self.history_next(line),
            _ => match key.text {
                // Readline splits written text on these line terminators.
                Some('\u{2028}' | '\u{2029}') => self.line(line),
                Some(chr) => self.insert(line, &[chr]),
                None => {}
            },
        }
    }

    fn before_edit(&mut self, line: &StringCursor) {
        self.undo.push(line.clone());

        if self.undo.len() > UNDO_SIZE {
            self.undo.remove(0);
        }
    }

    fn insert(&mut self, line: &mut StringCursor, value: &[char]) {
        self.before_edit(line);

        let position = line.position();
        let chars = line.chars();
        let joined = text(&[&chars[..position], value, &chars[position..]].concat());

        line.set(&joined, position + value.len());
    }

    fn splice(line: &mut StringCursor, start: usize, end: usize, position: usize) {
        let chars = line.chars();
        let joined = text(&[&chars[..start], &chars[end..]].concat());

        line.set(&joined, position);
    }

    fn delete_left(&mut self, line: &mut StringCursor) {
        let position = line.position();

        if position > 0 && !line.chars().is_empty() {
            self.before_edit(line);
            Self::splice(line, position - 1, position, position - 1);
        }
    }

    fn delete_right(&mut self, line: &mut StringCursor) {
        let position = line.position();

        if position < line.chars().len() {
            self.before_edit(line);
            Self::splice(line, position, position + 1, position);
        }
    }

    fn delete_word_left(&mut self, line: &mut StringCursor) {
        let position = line.position();

        if position > 0 {
            self.before_edit(line);

            let start = position - word_left(&line.chars()[..position]);

            Self::splice(line, start, position, start);
        }
    }

    fn delete_word_right(&mut self, line: &mut StringCursor) {
        let position = line.position();

        if position < line.chars().len() {
            self.before_edit(line);

            let end = position + delete_word_right(&line.chars()[position..]);

            Self::splice(line, position, end, position);
        }
    }

    fn delete_line_left(&mut self, line: &mut StringCursor) {
        self.before_edit(line);

        let position = line.position();
        let deleted = text(&line.chars()[..position]);

        Self::splice(line, 0, position, 0);
        self.push_kill(deleted);
    }

    fn delete_line_right(&mut self, line: &mut StringCursor) {
        self.before_edit(line);

        let position = line.position();
        let deleted = text(&line.chars()[position..]);

        Self::splice(line, position, line.chars().len(), position);
        self.push_kill(deleted);
    }

    fn word_left(&mut self, line: &mut StringCursor) {
        let position = line.position();

        if position > 0 {
            line.move_to(position - word_left(&line.chars()[..position]));
        }
    }

    fn word_right(&mut self, line: &mut StringCursor) {
        let position = line.position();

        if position < line.chars().len() {
            line.move_to(position + word_right(&line.chars()[position..]));
        }
    }

    fn push_kill(&mut self, deleted: TText) {
        if deleted.is_empty() || self.kill_ring.first() == Some(&deleted) {
            return;
        }

        self.kill_ring.insert(0, deleted);
        self.kill_cursor = 0;
        self.kill_ring.truncate(KILL_RING_SIZE);
    }

    fn yank(&mut self, line: &mut StringCursor) {
        if let Some(killed) = self.kill_ring.get(self.kill_cursor).cloned() {
            self.yanking = true;
            self.insert(line, &killed);
        }
    }

    fn yank_pop(&mut self, line: &mut StringCursor) {
        if !self.yanking || self.kill_ring.len() < 2 {
            return;
        }

        let previous = self.kill_ring[self.kill_cursor].len();

        self.kill_cursor = (self.kill_cursor + 1) % self.kill_ring.len();

        let current = &self.kill_ring[self.kill_cursor];
        let position = line.position();
        let head = &line.chars()[..position.saturating_sub(previous)];
        let joined = text(&[head, current, &line.chars()[position..]].concat());

        line.set(&joined, head.len() + current.len());
    }

    fn undo(&mut self, line: &mut StringCursor) {
        if let Some(entry) = self.undo.pop() {
            self.redo.push(line.clone());
            line.set(entry.chars(), entry.position());
        }
    }

    fn redo(&mut self, line: &mut StringCursor) {
        if let Some(entry) = self.redo.pop() {
            self.undo.push(line.clone());
            line.set(entry.chars(), entry.position());
        }
    }

    fn line(&mut self, line: &mut StringCursor) {
        self.add_history(line.chars());
        line.set(&[], 0);
        self.undo.clear();
        self.redo.clear();
    }

    fn add_history(&mut self, value: &[char]) {
        if value.iter().all(|&c| js_space(c)) {
            return;
        }

        if self.history.first().is_none_or(|first| first[..] != *value) {
            self.history.insert(0, text(value));
            self.history.truncate(HISTORY_SIZE);
        }

        self.history_index = -1;
    }

    fn history_prev(&mut self, line: &mut StringCursor) {
        if self.history.is_empty() || self.history.len() as isize == self.history_index {
            return;
        }

        self.before_edit(line);

        let search = self.substring_search.clone().unwrap_or_default();
        let mut index = self.history_index + 1;

        while (index as usize) < self.history.len()
            && self.skips(line, &self.history[index as usize], &search)
        {
            index += 1;
        }

        self.history_index = index;
        self.show_history(line, search);
    }

    fn history_next(&mut self, line: &mut StringCursor) {
        if self.history_index < 0 || self.history.is_empty() {
            return;
        }

        self.before_edit(line);

        let search = self.substring_search.clone().unwrap_or_default();
        let mut index = self.history_index - 1;

        while index >= 0 && self.skips(line, &self.history[index as usize], &search) {
            index -= 1;
        }

        self.history_index = index;
        self.show_history(line, search);
    }

    fn skips(&self, line: &StringCursor, entry: &[char], search: &[char]) -> bool {
        !entry.starts_with(search) || line.chars() == entry
    }

    fn show_history(&self, line: &mut StringCursor, search: TText) {
        let entry = usize::try_from(self.history_index)
            .ok()
            .and_then(|index| self.history.get(index))
            .unwrap_or(&search);

        line.set(entry, entry.len());
    }
}

fn text(value: &[char]) -> TText {
    Zeroizing::new(value.to_vec())
}

/// JavaScript's `\s`.
fn js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n'
            | '\x0b'
            | '\x0c'
            | '\r'
            | ' '
            | '\u{a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}

/// JavaScript's `\w`, which is ASCII only without the `u` flag.
fn js_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn run(chars: impl Iterator<Item = char>, class: impl Fn(char) -> bool) -> usize {
    chars.take_while(|&c| class(c)).count()
}

/// Length of `/^\s*(?:[^\w\s]+|\w+)?/` over the reversed text before the cursor.
fn word_left(leading: &[char]) -> usize {
    let spaces = run(leading.iter().rev().copied(), js_space);
    let rest = leading.iter().rev().skip(spaces).copied();

    spaces
        + match leading.len().checked_sub(spaces + 1).map(|i| leading[i]) {
            Some(c) if js_word(c) => run(rest, js_word),
            Some(_) => run(rest, |c| !js_word(c) && !js_space(c)),
            None => 0,
        }
}

/// Length of `/^(?:\s+|[^\w\s]+|\w+)\s*/` over the text after the cursor.
fn word_right(trailing: &[char]) -> usize {
    let first = match trailing.first() {
        Some(&c) if js_space(c) => run(trailing.iter().copied(), js_space),
        Some(&c) if js_word(c) => run(trailing.iter().copied(), js_word),
        Some(_) => run(trailing.iter().copied(), |c| !js_word(c) && !js_space(c)),
        None => 0,
    };

    first + run(trailing[first..].iter().copied(), js_space)
}

/// Length of `/^(?:\s+|\W+|\w+)\s*/` over the text after the cursor.
fn delete_word_right(trailing: &[char]) -> usize {
    let first = match trailing.first() {
        Some(&c) if js_space(c) => run(trailing.iter().copied(), js_space),
        Some(&c) if js_word(c) => run(trailing.iter().copied(), js_word),
        Some(_) => run(trailing.iter().copied(), |c| !js_word(c)),
        None => 0,
    };

    first + run(trailing[first..].iter().copied(), js_space)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prompt::keypress::parse;

    fn edit(initial: &str, input: &str) -> (String, bool) {
        let mut line = StringCursor::default();

        line.extend(initial);

        let mut readline = Readline::new(&mut line);
        let mut chars = input.chars().peekable();

        while chars.peek().is_some() {
            let key = parse(&mut |_| Ok(chars.next())).unwrap();

            readline.apply(&mut line, &key);
        }

        (line.to_string(), readline.closed())
    }

    #[test]
    fn edits_like_readline() {
        let cases = [
            ("device", "\x01\x06\x15X", "Xevice"),
            ("device", "\x01\x04X", "Xevice"),
            ("device", "-my-thing\x17X", "device-my-X"),
            ("device", " a-b\x01\x1bf\x1bfX", "device aX-b"),
            ("device", "\x01\x1b[3;5~X", "X"),
            ("device", "\x15\x19X", "deviceX"),
            ("device", "a\x02\x0b\x01\x0b\x19\x1by", "a"),
            ("device", "ab\x1f\x1fX", "deviceX"),
            ("device", "\x1f\x1f\x1eX", "deviceX"),
            ("device", "x\x0d\x15\x1b[A", "devicex"),
            ("device", "\x1c", "device\x1c"),
        ];

        for (initial, input, expected) in cases {
            assert_eq!(edit(initial, input).0, expected, "{input:?}");
        }
    }

    #[test]
    fn ctrl_d_closes_only_an_empty_line() {
        assert_eq!(edit("", "\x04X"), (String::new(), true));
        assert_eq!(edit("a", "\x04X"), ("aX".into(), false));
    }
}
