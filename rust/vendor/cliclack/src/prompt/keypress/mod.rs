mod codes;
mod key;
mod parse;
mod sequence;

#[cfg(test)]
mod tests;

pub use key::{Keypress, Name};
pub use parse::parse;
