use super::super::cursor::StringCursor;
use super::interface::Readline;
use super::text::text;
use super::words::{delete_word_right, word_left, word_right};

/// Readline's edits; each one records an undo step first.
impl Readline {
    pub(super) fn insert(&mut self, line: &mut StringCursor, value: &[char]) {
        self.undo.record(line);

        let position = line.position();
        let chars = line.chars();
        let joined = text(&[&chars[..position], value, &chars[position..]].concat());

        line.set(&joined, position + value.len());
    }

    pub(super) fn delete_left(&mut self, line: &mut StringCursor) {
        let position = line.position();

        if position > 0 && !line.chars().is_empty() {
            self.undo.record(line);
            splice(line, position - 1, position, position - 1);
        }
    }

    pub(super) fn delete_right(&mut self, line: &mut StringCursor) {
        let position = line.position();

        if position < line.chars().len() {
            self.undo.record(line);
            splice(line, position, position + 1, position);
        }
    }

    pub(super) fn delete_word_left(&mut self, line: &mut StringCursor) {
        let position = line.position();

        if position > 0 {
            self.undo.record(line);

            let start = position - word_left(&line.chars()[..position]);

            splice(line, start, position, start);
        }
    }

    pub(super) fn delete_word_right(&mut self, line: &mut StringCursor) {
        let position = line.position();

        if position < line.chars().len() {
            self.undo.record(line);

            let end = position + delete_word_right(&line.chars()[position..]);

            splice(line, position, end, position);
        }
    }

    pub(super) fn delete_line_left(&mut self, line: &mut StringCursor) {
        self.undo.record(line);

        let position = line.position();
        let deleted = text(&line.chars()[..position]);

        splice(line, 0, position, 0);
        self.kill_ring.push(deleted);
    }

    pub(super) fn delete_line_right(&mut self, line: &mut StringCursor) {
        self.undo.record(line);

        let position = line.position();
        let deleted = text(&line.chars()[position..]);

        splice(line, position, line.chars().len(), position);
        self.kill_ring.push(deleted);
    }

    pub(super) fn yank(&mut self, line: &mut StringCursor) {
        if let Some(killed) = self.kill_ring.yank() {
            self.insert(line, &killed);
        }
    }

    pub(super) fn yank_pop(&mut self, line: &mut StringCursor) {
        let Some((previous, current)) = self.kill_ring.rotate() else {
            return;
        };

        let position = line.position();
        let head = &line.chars()[..position.saturating_sub(previous)];
        let joined = text(&[head, current, &line.chars()[position..]].concat());

        line.set(&joined, head.len() + current.len());
    }

    pub(super) fn history_prev(&mut self, line: &mut StringCursor) {
        if let Some(entry) = self.history.prev(line) {
            self.undo.record(line);
            line.set(&entry, entry.len());
        }
    }

    pub(super) fn history_next(&mut self, line: &mut StringCursor) {
        if let Some(entry) = self.history.next(line) {
            self.undo.record(line);
            line.set(&entry, entry.len());
        }
    }
}

pub(super) fn word_left_of(line: &mut StringCursor) {
    let position = line.position();

    if position > 0 {
        line.move_to(position - word_left(&line.chars()[..position]));
    }
}

pub(super) fn word_right_of(line: &mut StringCursor) {
    let position = line.position();

    if position < line.chars().len() {
        line.move_to(position + word_right(&line.chars()[position..]));
    }
}

fn splice(line: &mut StringCursor, start: usize, end: usize, position: usize) {
    let chars = line.chars();
    let joined = text(&[&chars[..start], &chars[end..]].concat());

    line.set(&joined, position);
}
