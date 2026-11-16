/// A key name as Node's readline `emitKeys` reports it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Name {
    /// A letter or digit (lowercased), or the letter of a Ctrl chord.
    Char(char),
    Key(&'static str),
}

/// One decoded keypress, mirroring readline's `(s, key)` pair.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Keypress {
    pub name: Option<Name>,
    pub ctrl: bool,
    pub meta: bool,
    pub shift: bool,
    /// The typed character; readline passes none for escape sequences.
    pub text: Option<char>,
}

impl Keypress {
    pub fn is(&self, name: &str) -> bool {
        matches!(self.name, Some(Name::Key(key)) if key == name) || self.is_char(name)
    }

    fn is_char(&self, name: &str) -> bool {
        let mut chars = name.chars();

        matches!(self.name, Some(Name::Char(c)) if chars.next() == Some(c) && chars.next().is_none())
    }
}
