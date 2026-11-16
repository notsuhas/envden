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
    let resolve = |value: &Path| {
        let absolute = std::path::absolute(value).unwrap_or_else(|_| value.to_owned());
        crate::links::takeover::sibling::normalize(&absolute)
    };
    let resolved_path = resolve(path);
    let resolved_home = resolve(home);
    match resolved_path.strip_prefix(resolved_home) {
        Ok(rest) if rest.as_os_str().is_empty() => "~".into(),
        Ok(rest) => format!("~{}{}", std::path::MAIN_SEPARATOR, rest.display()),
        Err(_) => path.display().to_string(),
    }
}

pub fn print(value: &str) {
    println!("{}", super::sanitize_console(value));
}

pub fn print_error(value: &str) {
    eprintln!("{}", super::sanitize_terminal(value));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn home_paths_resolve_relative_and_dotted_arguments() {
        assert_eq!(
            home_path(Path::new("/home/me/../other"), Path::new("/home/me")),
            "/home/me/../other"
        );
        assert_eq!(
            home_path(Path::new("/home/me/sub/../file"), Path::new("/home/me/.")),
            format!("~{}file", std::path::MAIN_SEPARATOR)
        );
        assert_eq!(home_path(Path::new("."), Path::new(".")), "~");
    }
}
