use super::text::TText;

const KILL_RING_SIZE: usize = 32;

/// Readline's kill ring, newest first, with the yank-pop cursor.
#[derive(Default)]
pub struct KillRing {
    entries: Vec<TText>,
    cursor: usize,
    yanking: bool,
}

impl KillRing {
    pub fn push(&mut self, deleted: TText) {
        if deleted.is_empty() || self.entries.first() == Some(&deleted) {
            return;
        }

        self.entries.insert(0, deleted);
        self.cursor = 0;
        self.entries.truncate(KILL_RING_SIZE);
    }

    /// Any key but Alt-Y ends a yank, so a later Alt-Y does nothing.
    pub fn stop_yanking(&mut self) {
        self.yanking = false;
    }

    pub fn yank(&mut self) -> Option<TText> {
        let killed = self.entries.get(self.cursor).cloned();

        self.yanking |= killed.is_some();

        killed
    }

    /// Moves to the next entry, returning the length of the one it replaces.
    pub fn rotate(&mut self) -> Option<(usize, &[char])> {
        if !self.yanking || self.entries.len() < 2 {
            return None;
        }

        let previous = self.entries[self.cursor].len();

        self.cursor = (self.cursor + 1) % self.entries.len();

        Some((previous, &self.entries[self.cursor]))
    }
}
