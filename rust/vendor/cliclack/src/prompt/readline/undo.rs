use super::super::cursor::StringCursor;

const UNDO_SIZE: usize = 2048;

/// Readline's undo and redo stacks of whole-line snapshots.
#[derive(Default)]
pub struct Undo {
    done: Vec<StringCursor>,
    undone: Vec<StringCursor>,
}

impl Undo {
    pub fn record(&mut self, line: &StringCursor) {
        self.done.push(line.clone());

        if self.done.len() > UNDO_SIZE {
            self.done.remove(0);
        }
    }

    pub fn undo(&mut self, line: &mut StringCursor) {
        if let Some(entry) = self.done.pop() {
            self.undone.push(line.clone());
            line.set(entry.chars(), entry.position());
        }
    }

    pub fn redo(&mut self, line: &mut StringCursor) {
        if let Some(entry) = self.undone.pop() {
            self.done.push(line.clone());
            line.set(entry.chars(), entry.position());
        }
    }

    pub fn clear(&mut self) {
        self.done.clear();
        self.undone.clear();
    }
}
