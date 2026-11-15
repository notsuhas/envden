use envden_core::errors::{ErrorCode, Result};

pub fn retry_head<T>(mut run: impl FnMut() -> Result<T>) -> Result<T> {
    for attempt in 0..3 {
        match run() {
            Err(error) if error.code == ErrorCode::HeadMoved && attempt < 2 => {}
            result => return result,
        }
    }
    unreachable!()
}

pub fn retry_busy<T>(mut run: impl FnMut() -> Result<T>, mut wait: impl FnMut(u64)) -> Result<T> {
    for attempt in 0..3 {
        match run() {
            Err(error) if error.code == ErrorCode::Busy && attempt < 2 => wait(100 * (attempt + 1)),
            result => return result,
        }
    }
    unreachable!()
}
