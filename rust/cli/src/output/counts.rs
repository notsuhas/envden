use std::cell::Cell;

#[derive(Clone, Copy, Default)]
pub struct ICounts {
    pub changed: Option<u64>,
    pub conflicts: Option<u64>,
}

thread_local! { static COUNTS: Cell<ICounts> = Cell::default(); }

pub fn command_counts() -> ICounts {
    COUNTS.get()
}
pub fn set_command_counts(counts: ICounts) {
    COUNTS.set(counts);
}
pub fn with_command_counts<T>(action: impl FnOnce() -> T) -> T {
    let previous = COUNTS.replace(ICounts::default());
    let result = action();
    COUNTS.set(previous);
    result
}
