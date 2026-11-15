use std::{fs, path::Path};

pub fn regular_target(path: &Path) -> bool {
    fs::metadata(path).is_ok_and(|m| m.is_file())
}

pub fn read_target(path: &Path) -> Option<Vec<u8>> {
    if regular_target(path) {
        fs::read(path).ok()
    } else {
        None
    }
}
