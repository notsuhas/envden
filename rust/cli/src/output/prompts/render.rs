pub fn intro(message: &str) {
    let _ = cliclack::intro(message);
}

pub fn outro(message: &str) {
    let _ = cliclack::outro(message);
}

pub fn log(message: &str) {
    let _ = cliclack::log::info(message);
}

pub fn note(message: &str, title: &str) {
    let _ = cliclack::note(title, message);
}

pub fn cancel(message: &str) {
    let _ = cliclack::outro_cancel(message);
}
