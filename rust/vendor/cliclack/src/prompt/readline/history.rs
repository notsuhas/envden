use super::super::cursor::StringCursor;
use super::text::{text, TText};
use super::words::js_space;

const HISTORY_SIZE: usize = 30;

/// The lines submitted in this prompt, newest first, with readline's substring search.
pub struct History {
    entries: Vec<TText>,
    index: isize,
    search: Option<TText>,
}

impl Default for History {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            index: -1,
            search: None,
        }
    }
}

impl History {
    /// Starts the search on the first vertical move; any other key ends it.
    pub fn track(&mut self, line: &StringCursor, vertical: bool) {
        if vertical {
            if self.search.is_none() {
                self.search = Some(text(&line.chars()[..line.position()]));
            }
        } else if self.search.take().is_some() && self.entries.len() as isize == self.index {
            self.index = -1;
        }
    }

    pub fn add(&mut self, value: &[char]) {
        if value.iter().all(|&c| js_space(c)) {
            return;
        }

        if self.entries.first().is_none_or(|first| first[..] != *value) {
            self.entries.insert(0, text(value));
            self.entries.truncate(HISTORY_SIZE);
        }

        self.index = -1;
    }

    /// The older line to show, if readline moves.
    pub fn prev(&mut self, line: &StringCursor) -> Option<TText> {
        if self.entries.is_empty() || self.entries.len() as isize == self.index {
            return None;
        }

        let search = self.search.clone().unwrap_or_default();
        let mut index = self.index + 1;

        while (index as usize) < self.entries.len() && skips(line, &self.entries[index as usize], &search) {
            index += 1;
        }

        Some(self.show(index, search))
    }

    /// The newer line to show, if readline moves.
    pub fn next(&mut self, line: &StringCursor) -> Option<TText> {
        if self.index < 0 || self.entries.is_empty() {
            return None;
        }

        let search = self.search.clone().unwrap_or_default();
        let mut index = self.index - 1;

        while index >= 0 && skips(line, &self.entries[index as usize], &search) {
            index -= 1;
        }

        Some(self.show(index, search))
    }

    fn show(&mut self, index: isize, search: TText) -> TText {
        self.index = index;

        usize::try_from(index)
            .ok()
            .and_then(|index| self.entries.get(index))
            .cloned()
            .unwrap_or(search)
    }
}

fn skips(line: &StringCursor, entry: &[char], search: &[char]) -> bool {
    !entry.starts_with(search) || line.chars() == entry
}
