use envden_core::errors::ErrorCode;
use std::path::Path;

pub fn error_exit_code(code: ErrorCode) -> i32 {
    match code {
        ErrorCode::Conflict => 3,
        ErrorCode::InvalidInput | ErrorCode::NotImplemented => 2,
        _ => 1,
    }
}

pub fn skips_notices(name: &str, json: bool) -> bool {
    json || matches!(
        name,
        "status" | "version" | "config" | "help" | "update" | "serve"
    )
}

pub fn home_path(path: &Path, home: &Path) -> String {
    match path.strip_prefix(home) {
        Ok(rest) if rest.as_os_str().is_empty() => "~".into(),
        Ok(rest) => format!("~/{}", rest.display()),
        Err(_) => path.display().to_string(),
    }
}

pub fn print(value: &str) {
    println!("{}", super::sanitize_console(value));
}

pub fn print_error(value: &str) {
    eprintln!("{}", super::sanitize_terminal(value));
}
