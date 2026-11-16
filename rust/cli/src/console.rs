macro_rules! println {
    () => { std::println!() };
    ($($arguments:tt)*) => {
        std::println!("{}", $crate::output::sanitize_console(&format!($($arguments)*)))
    };
}

macro_rules! eprintln {
    () => { std::eprintln!() };
    ($($arguments:tt)*) => {
        std::eprintln!("{}", $crate::output::sanitize_terminal(&format!($($arguments)*)))
    };
}
