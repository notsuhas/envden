use super::super::cursor::StringCursor;
use super::super::keypress::{Keypress, Name};
use super::edit::{word_left_of, word_right_of};
use super::history::History;
use super::kill_ring::KillRing;
use super::text::text;
use super::undo::Undo;

/// Line editing as Node's readline `Interface` applies it under Clack.
pub struct Readline {
    pub(super) kill_ring: KillRing,
    pub(super) undo: Undo,
    pub(super) history: History,
    closed: bool,
}

impl Readline {
    /// Starts like Clack, which writes the initial text into an empty line.
    pub fn new(line: &mut StringCursor) -> Self {
        let mut readline = Self {
            kill_ring: KillRing::default(),
            undo: Undo::default(),
            history: History::default(),
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
            Some('\x1f') => return self.undo.undo(line),
            Some('\x1e') => return self.undo.redo(line),
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
            self.kill_ring.stop_yanking();
        }

        let vertical = (key.is("up") || key.is("down")) && !key.ctrl && !key.meta && !key.shift;

        self.history.track(line, vertical);
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
            Some(Name::Key("left")) => word_left_of(line),
            Some(Name::Key("right")) => word_right_of(line),
            _ => {}
        }
    }

    fn meta(&mut self, line: &mut StringCursor, key: &Keypress) {
        match key.name {
            Some(Name::Char('b')) => word_left_of(line),
            Some(Name::Char('f')) => word_right_of(line),
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

    fn line(&mut self, line: &mut StringCursor) {
        self.history.add(line.chars());
        line.set(&[], 0);
        self.undo.clear();
    }
}
